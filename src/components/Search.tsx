import React, { useState } from "react";
import { User } from "firebase/auth";
import { UserProfile } from "../types";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { Link } from "react-router-dom";
import { Search as SearchIcon, MessageSquare, User as UserIcon, XCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface SearchProps {
  user: User;
  profile: UserProfile | null;
}

export default function Search({ user, profile }: SearchProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setLoading(true);
    setHasSearched(true);
    try {
      const q = query(
        collection(db, "users"),
        where("username", "==", searchTerm.trim().toLowerCase()),
        limit(1)
      );
      const querySnapshot = await getDocs(q);
      const users = querySnapshot.docs.map(doc => doc.data() as UserProfile);
      setResults(users.filter(u => u.uid !== user.uid));
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, "users");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 p-6 overflow-y-auto">
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-white tracking-tight">Find People</h2>
        <p className="text-neutral-400 mt-1">Search by exact username to start a private conversation.</p>
      </header>

      <form onSubmit={handleSearch} className="mb-12 relative">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={20} />
        <input 
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Enter exact username..."
          className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
        />
        <button 
          type="submit"
          className="absolute right-3 top-1/2 -translate-y-1/2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-bold transition-all"
        >
          Search
        </button>
      </form>

      <div className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {results.length > 0 ? (
              <motion.div 
                key="results"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
              >
                {results.map((result) => (
                  <div 
                    key={result.uid}
                    className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex items-center gap-6 hover:border-neutral-700 transition-all"
                  >
                    <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center font-bold text-2xl">
                      {result.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-bold text-white truncate">{result.displayName}</h3>
                      <p className="text-neutral-400 text-sm mb-4">@{result.username}</p>
                      <Link 
                        to={`/chat/${result.uid}`}
                        className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20"
                      >
                        <MessageSquare size={18} /> Message
                      </Link>
                    </div>
                  </div>
                ))}
              </motion.div>
            ) : hasSearched ? (
              <motion.div 
                key="no-results"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-12"
              >
                <div className="w-16 h-16 bg-neutral-900 border border-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4 text-neutral-500">
                  <XCircle size={32} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">User not found</h3>
                <p className="text-neutral-400">Make sure the username is spelled correctly.</p>
              </motion.div>
            ) : (
              <div className="text-center py-12 text-neutral-500">
                <div className="w-16 h-16 bg-neutral-900 border border-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <UserIcon size={32} />
                </div>
                <p>Search for a username to start chatting.</p>
              </div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
