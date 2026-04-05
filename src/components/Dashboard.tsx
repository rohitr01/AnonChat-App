import { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { UserProfile, Message, Room } from "../types";
import { collection, query, where, onSnapshot, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Link } from "react-router-dom";
import { MessageSquare, Hash, Plus, Search, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "../lib/utils";

interface DashboardProps {
  user: User;
  profile: UserProfile | null;
}

export default function Dashboard({ user, profile }: DashboardProps) {
  const [recentChats, setRecentChats] = useState<{ user: UserProfile, lastMessage?: Message }[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    // Fetch rooms the user is a member of
    const roomsQuery = query(
      collection(db, "rooms"),
      where("members", "array-contains", user.uid)
    );

    const unsubscribeRooms = onSnapshot(roomsQuery, (snapshot) => {
      const roomsData = snapshot.docs.map(doc => doc.data() as Room);
      setRooms(roomsData);
    });

    // Fetch recent DMs
    // This is a bit complex in Firestore without a dedicated 'conversations' collection
    // For this prototype, we'll fetch messages where the user is sender or receiver
    const fetchRecentDMs = async () => {
      const messagesRef = collection(db, "direct_messages");
      // We'll just fetch all DM subcollections the user is part of
      // In a real app, you'd have a 'conversations' collection
      // For now, let's just show a "Start a new chat" message if empty
      setLoading(false);
    };

    fetchRecentDMs();

    return () => {
      unsubscribeRooms();
    };
  }, [user]);

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 p-6 overflow-y-auto">
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-white tracking-tight">Dashboard</h2>
        <p className="text-neutral-400 mt-1">Welcome back, {profile?.displayName || "Anonymous"}.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Chats */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-white flex items-center gap-2">
              <MessageSquare size={20} className="text-blue-500" />
              Recent Chats
            </h3>
            <Link to="/search" className="text-sm text-blue-400 hover:text-blue-300 font-medium">
              New Chat
            </Link>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
            {recentChats.length > 0 ? (
              <div className="divide-y divide-neutral-800">
                {recentChats.map((chat) => (
                  <Link 
                    key={chat.user.uid}
                    to={`/chat/${chat.user.uid}`}
                    className="flex items-center gap-4 p-4 hover:bg-neutral-800 transition-colors"
                  >
                    <div className="w-12 h-12 bg-neutral-800 rounded-full flex items-center justify-center font-bold text-lg">
                      {chat.user.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium text-white truncate">{chat.user.displayName}</p>
                        {chat.lastMessage && (
                          <span className="text-xs text-neutral-500">
                            {formatDistanceToNow(chat.lastMessage.createdAt)} ago
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-neutral-400 truncate">
                        {chat.lastMessage?.content || "No messages yet"}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center">
                <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search size={24} className="text-neutral-500" />
                </div>
                <p className="text-neutral-400">No active chats yet.</p>
                <Link 
                  to="/search" 
                  className="mt-4 inline-block bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl font-medium transition-all"
                >
                  Find People
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Rooms */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-white flex items-center gap-2">
              <Hash size={20} className="text-green-500" />
              Your Rooms
            </h3>
            <Link to="/rooms" className="text-sm text-green-400 hover:text-green-300 font-medium">
              Explore Rooms
            </Link>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
            {rooms.length > 0 ? (
              <div className="divide-y divide-neutral-800">
                {rooms.map((room) => (
                  <Link 
                    key={room.id}
                    to={`/rooms/${room.id}`}
                    className="flex items-center gap-4 p-4 hover:bg-neutral-800 transition-colors"
                  >
                    <div className="w-12 h-12 bg-neutral-800 rounded-xl flex items-center justify-center font-bold text-lg text-green-500">
                      #
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium text-white truncate">{room.name}</p>
                        <span className="text-xs text-neutral-500 flex items-center gap-1">
                          <Users size={12} /> {room.members.length}
                        </span>
                      </div>
                      <p className="text-sm text-neutral-400 truncate">{room.description}</p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center">
                <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Plus size={24} className="text-neutral-500" />
                </div>
                <p className="text-neutral-400">You haven't joined any rooms.</p>
                <Link 
                  to="/rooms" 
                  className="mt-4 inline-block bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-xl font-medium transition-all"
                >
                  Join a Room
                </Link>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
