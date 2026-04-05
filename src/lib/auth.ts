import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  updateProfile
} from "firebase/auth";
import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  arrayUnion, 
  arrayRemove,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  deleteDoc
} from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "./firebase";
import { UserProfile, Session } from "../types";

const DOMAIN = "anon.chat";

export async function signUp(username: string, password: string, recoveryEmail?: string) {
  const email = `${username}@${DOMAIN}`;
  
  try {
    // Check if username already exists in Firestore
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("username", "==", username));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      throw new Error("Username already taken. Please choose another one.");
    }

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    await updateProfile(user, { displayName: username });

    const userProfile: UserProfile = {
      uid: user.uid,
      username,
      displayName: username,
      createdAt: Date.now(),
      lastActive: Date.now(),
      sessions: [],
      blockedUsers: [],
      email: recoveryEmail || undefined,
    };

    await setDoc(doc(db, "users", user.uid), userProfile);
    return user;
  } catch (err: any) {
    if (err.code === 'auth/email-already-in-use') {
      throw new Error("This username is already registered.");
    } else if (err.code === 'auth/weak-password') {
      throw new Error("Password is too weak. Please use at least 6 characters.");
    } else if (err.message && !err.message.includes('{')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, "users/UID");
  }
}

export async function signIn(username: string, password: string) {
  const email = `${username}@${DOMAIN}`;
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Auto-detect device name
    const deviceName = navigator.userAgent.includes("Mobile") ? "Mobile Device" : "Desktop Browser";

    // Handle session management
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const userData = userDoc.data() as UserProfile;

    // Limit to 2 active sessions
    if (userData.sessions && userData.sessions.length >= 2) {
      // Remove the oldest session
      const oldestSessionId = userData.sessions[0];
      try {
        await deleteDoc(doc(db, "sessions", oldestSessionId));
      } catch (err) {
        console.error("Error deleting oldest session:", err);
      }
      await updateDoc(doc(db, "users", user.uid), {
        sessions: arrayRemove(oldestSessionId)
      });
    }

    const sessionId = Math.random().toString(36).substring(7);
    const session: Session = {
      id: sessionId,
      userId: user.uid,
      deviceId: Math.random().toString(36).substring(7),
      deviceName,
      createdAt: Date.now(),
      lastActive: Date.now(),
    };

    await setDoc(doc(db, "sessions", sessionId), session);
    await updateDoc(doc(db, "users", user.uid), {
      sessions: arrayUnion(sessionId),
      lastActive: Date.now()
    });

    localStorage.setItem("sessionId", sessionId);
    return { user, sessionId };
  } catch (err: any) {
    if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      throw new Error("Invalid username or password.");
    } else if (err.code === 'auth/too-many-requests') {
      throw new Error("Too many failed attempts. Please try again later.");
    } else if (err.message && !err.message.includes('{')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, "sessions/ID");
  }
}

export async function updateLastActive() {
  const user = auth.currentUser;
  const sessionId = localStorage.getItem("sessionId");
  if (user && sessionId) {
    const now = Date.now();
    try {
      await updateDoc(doc(db, "users", user.uid), { lastActive: now });
      await updateDoc(doc(db, "sessions", sessionId), { lastActive: now });
    } catch (err) {
      console.error("Silent fail on lastActive update:", err);
    }
  }
}

export async function checkSessionExpiration() {
  const user = auth.currentUser;
  const sessionId = localStorage.getItem("sessionId");
  if (user && sessionId) {
    try {
      const sessionDoc = await getDoc(doc(db, "sessions", sessionId));
      if (sessionDoc.exists()) {
        const sessionData = sessionDoc.data() as Session;
        const threeDays = 3 * 24 * 60 * 60 * 1000;
        if (Date.now() - sessionData.lastActive > threeDays) {
          await logout(sessionId);
          localStorage.removeItem("sessionId");
          return true; // Expired
        }
      } else {
        await logout();
        localStorage.removeItem("sessionId");
        return true;
      }
    } catch (err) {
      console.error("Session check error:", err);
    }
  }
  return false;
}

export async function logout(sessionId?: string) {
  const user = auth.currentUser;
  try {
    if (user && sessionId) {
      await updateDoc(doc(db, "users", user.uid), {
        sessions: arrayRemove(sessionId)
      });
      await deleteDoc(doc(db, "sessions", sessionId));
    }
  } catch (err) {
    console.error("Logout cleanup error:", err);
  } finally {
    await signOut(auth);
  }
}

export async function deleteAccount(uid: string) {
  const user = auth.currentUser;
  if (user && user.uid === uid) {
    try {
      // Delete user profile
      await deleteDoc(doc(db, "users", uid));
      // Delete user sessions
      const sessionsRef = collection(db, "sessions");
      const q = query(sessionsRef, where("userId", "==", uid));
      const querySnapshot = await getDocs(q);
      const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      // Delete auth user
      await user.delete();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${uid}`);
    }
  }
}
