import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { UserProfile, Session } from "../types";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc,
  getDocs,
  arrayRemove
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { 
  User as UserIcon, 
  Smartphone, 
  Trash2, 
  LogOut, 
  Shield, 
  Settings,
  AlertTriangle,
  X
} from "lucide-react";
import { deleteAccount, logout } from "../lib/auth";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";

interface ProfileProps {
  user: User;
  profile: UserProfile | null;
}

export default function Profile({ user, profile }: ProfileProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState(profile?.displayName || "");
  const [newBio, setNewBio] = useState(profile?.bio || "");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, "sessions"), where("userId", "==", user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sessionsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Session));
      setSessions(sessionsData);
    });

    return () => unsubscribe();
  }, [user]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setUpdating(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        displayName: newDisplayName,
        bio: newBio
      });
    } catch (err) {
      console.error("Error updating profile:", err);
    } finally {
      setUpdating(false);
    }
  };

  const handleLogoutSession = async (sessionId: string) => {
    try {
      await updateDoc(doc(db, "users", user.uid), {
        sessions: arrayRemove(sessionId)
      });
      await deleteDoc(doc(db, "sessions", sessionId));
    } catch (err) {
      console.error("Error logging out session:", err);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await deleteAccount(user.uid);
    } catch (err) {
      console.error("Error deleting account:", err);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 p-6 overflow-y-auto">
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-white tracking-tight">Profile Settings</h2>
        <p className="text-neutral-400 mt-1">Manage your anonymous identity and active sessions.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Info */}
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8">
            <div className="flex items-center gap-6 mb-8">
              <div className="w-24 h-24 bg-neutral-800 rounded-full flex items-center justify-center font-bold text-4xl text-blue-500">
                {profile?.username?.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white">{profile?.displayName}</h3>
                <p className="text-neutral-400">@{profile?.username}</p>
              </div>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300 ml-1">Display Name</label>
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300 ml-1">Bio</label>
                <textarea
                  value={newBio}
                  onChange={(e) => setNewBio(e.target.value)}
                  placeholder="Tell us about yourself..."
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all h-32 resize-none"
                />
              </div>
              <button
                type="submit"
                disabled={updating}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-3 rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-blue-600/20"
              >
                {updating ? "Saving..." : "Save Changes"}
              </button>
            </form>
          </section>

          {/* Active Sessions */}
          <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Smartphone size={20} className="text-blue-500" />
                Active Sessions
              </h3>
              <span className={cn(
                "text-xs px-2 py-1 rounded-full font-bold",
                sessions.length >= 2 ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"
              )}>
                {sessions.length} / 2 Active
              </span>
            </div>

            <div className="space-y-4">
              {sessions.map((session) => (
                <div key={session.id} className="flex items-center justify-between p-4 bg-neutral-800 rounded-xl border border-neutral-700">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-neutral-700 rounded-lg flex items-center justify-center text-neutral-300">
                      <Smartphone size={20} />
                    </div>
                    <div>
                      <p className="font-medium text-white">{session.deviceName}</p>
                      <p className="text-xs text-neutral-500">Device ID: {session.deviceId}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleLogoutSession(session.id)}
                    className="p-2 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-colors text-neutral-500"
                  >
                    <LogOut size={20} />
                  </button>
                </div>
              ))}
            </div>

            {sessions.length >= 2 && (
              <div className="mt-6 bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-start gap-3">
                <AlertTriangle size={20} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-400">
                  You have reached the maximum number of active sessions (2). To log in on a new device, you must log out from one of your existing sessions.
                </p>
              </div>
            )}
          </section>
        </div>

        {/* Danger Zone */}
        <div className="space-y-8">
          <section className="bg-red-500/5 border border-red-500/10 rounded-2xl p-8">
            <h3 className="text-xl font-bold text-red-400 flex items-center gap-2 mb-6">
              <Shield size={20} />
              Danger Zone
            </h3>
            <p className="text-sm text-neutral-400 mb-6">
              Deleting your account is permanent and cannot be undone. All your messages and profile data will be removed.
            </p>
            <button 
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white font-bold py-3 rounded-xl transition-all border border-red-500/20"
            >
              Delete Account
            </button>
          </section>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowDeleteConfirm(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-white">Are you sure?</h3>
                <button onClick={() => setShowDeleteConfirm(false)} className="p-2 hover:bg-neutral-800 rounded-full">
                  <X size={20} />
                </button>
              </div>

              <p className="text-neutral-400 mb-8">
                This action will permanently delete your account and all associated data. This cannot be undone.
              </p>

              <div className="flex gap-4">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-white font-bold py-3 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-red-600/20"
                >
                  Delete Forever
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
