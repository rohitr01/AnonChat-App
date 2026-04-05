import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { UserProfile, Room } from "../types";
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  arrayUnion, 
  arrayRemove,
  getDocs,
  where
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { Link, useNavigate } from "react-router-dom";
import { Hash, Plus, Users, Search, X } from "lucide-react";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";

interface RoomsProps {
  user: User;
  profile: UserProfile | null;
}

export default function Rooms({ user, profile }: RoomsProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomDesc, setNewRoomDesc] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const q = query(collection(db, "rooms"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const roomsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Room));
      setRooms(roomsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "rooms");
    });

    return () => unsubscribe();
  }, []);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim() || !user) return;

    try {
      const roomData: Partial<Room> = {
        name: newRoomName.trim(),
        description: newRoomDesc.trim(),
        createdBy: user.uid,
        createdAt: Date.now(),
        members: [user.uid],
      };

      const docRef = await addDoc(collection(db, "rooms"), roomData);
      setShowCreateModal(false);
      setNewRoomName("");
      setNewRoomDesc("");
      navigate(`/rooms/${docRef.id}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "rooms");
    }
  };

  const handleJoinRoom = async (roomId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "rooms", roomId), {
        members: arrayUnion(user.uid)
      });
      navigate(`/rooms/${roomId}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${roomId}`);
    }
  };

  const filteredRooms = rooms.filter(room => 
    room.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    room.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 p-6 overflow-y-auto">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Rooms</h2>
          <p className="text-neutral-400 mt-1">Join public conversations or create your own.</p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20"
        >
          <Plus size={20} /> Create Room
        </button>
      </header>

      <div className="mb-6 relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={20} />
        <input 
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search rooms..."
          className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
        />
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredRooms.map((room) => {
            const isMember = room.members.includes(user.uid);
            return (
              <motion.div 
                key={room.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex flex-col hover:border-neutral-700 transition-all group"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-neutral-800 rounded-xl flex items-center justify-center font-bold text-xl text-blue-500 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    #
                  </div>
                  <div className="flex items-center gap-1 text-neutral-500 text-sm font-medium">
                    <Users size={16} /> {room.members.length}
                  </div>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{room.name}</h3>
                <p className="text-neutral-400 text-sm mb-6 flex-1 line-clamp-3">{room.description}</p>
                
                {isMember ? (
                  <Link 
                    to={`/rooms/${room.id}`}
                    className="w-full bg-neutral-800 hover:bg-neutral-700 text-white font-bold py-3 rounded-xl text-center transition-all"
                  >
                    Open Room
                  </Link>
                ) : (
                  <button 
                    onClick={() => handleJoinRoom(room.id)}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all"
                  >
                    Join Room
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create Room Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowCreateModal(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-white">Create Room</h3>
                <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-neutral-800 rounded-full">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleCreateRoom} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-300 ml-1">Room Name</label>
                  <input
                    type="text"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="e.g. Tech Talk"
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-300 ml-1">Description</label>
                  <textarea
                    value={newRoomDesc}
                    onChange={(e) => setNewRoomDesc(e.target.value)}
                    placeholder="What's this room about?"
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all h-32 resize-none"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20 mt-4"
                >
                  Create Room
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
