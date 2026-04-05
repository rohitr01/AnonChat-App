import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "./lib/firebase";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { UserProfile } from "./types";
import Auth from "./components/Auth";
import Dashboard from "./components/Dashboard";
import Layout from "./components/Layout";
import Chat from "./components/Chat";
import Profile from "./components/Profile";
import Rooms from "./components/Rooms";
import Search from "./components/Search";
import { checkSessionExpiration, updateLastActive } from "./lib/auth";

import ErrorBoundary from "./components/ErrorBoundary";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const expired = await checkSessionExpiration();
          if (expired) {
            setUser(null);
            setProfile(null);
            setLoading(false);
            return;
          }
          
          setUser(user);
          // Listen for profile changes
          const unsubscribeProfile = onSnapshot(doc(db, "users", user.uid), (doc) => {
            if (doc.exists()) {
              setProfile(doc.data() as UserProfile);
            }
          }, (error) => {
            console.error("Profile snapshot error:", error);
          });
          
          // Update last active on load
          updateLastActive();

          return () => unsubscribeProfile();
        } catch (err) {
          console.error("Auth initialization error:", err);
          setUser(null);
          setProfile(null);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-950">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route path="/login" element={!user ? <Auth /> : <Navigate to="/" />} />
          <Route path="/" element={user ? <Layout user={user} profile={profile} /> : <Navigate to="/login" />}>
            <Route index element={<Dashboard user={user} profile={profile} />} />
            <Route path="chat/:chatId" element={<Chat user={user} profile={profile} />} />
            <Route path="rooms" element={<Rooms user={user} profile={profile} />} />
            <Route path="rooms/:roomId" element={<Chat user={user} profile={profile} isRoom />} />
            <Route path="search" element={<Search user={user} profile={profile} />} />
            <Route path="profile" element={<Profile user={user} profile={profile} />} />
          </Route>
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}
