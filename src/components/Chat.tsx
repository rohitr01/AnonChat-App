import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { User } from "firebase/auth";
import { UserProfile, Message, Room } from "../types";
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  doc, 
  getDoc, 
  setDoc,
  serverTimestamp,
  where,
  limit,
  updateDoc,
  arrayRemove,
  arrayUnion,
  deleteDoc
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage, handleFirestoreError, OperationType } from "../lib/firebase";
import { 
  Send, 
  Image as ImageIcon, 
  Video, 
  MoreVertical, 
  ArrowLeft, 
  ShieldAlert,
  Paperclip,
  X,
  Camera,
  Mic,
  StopCircle,
  Lock,
  Unlock,
  Smile,
  Check,
  CheckCheck,
  Clock
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { encryptMessage, decryptMessage } from "../lib/crypto";
import { updateLastActive } from "../lib/auth";

interface ChatProps {
  user: User;
  profile: UserProfile | null;
  isRoom?: boolean;
}

export default function Chat({ user, profile, isRoom = false }: ChatProps) {
  const { chatId, roomId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [targetUser, setTargetUser] = useState<UserProfile | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingType, setRecordingType] = useState<'video' | 'audio' | null>(null);
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [chatPassword, setChatPassword] = useState("");
  const [activeReactionMessageId, setActiveReactionMessageId] = useState<string | null>(null);
  const [isTabActive, setIsTabActive] = useState(true);
  const [typingUsers, setTypingUsers] = useState<{[uid: string]: string}>({});
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeId = isRoom ? roomId : chatId;

  useEffect(() => {
    if (!user || !activeId) return;

    setLoading(true);

    let messagesQuery;
    if (isRoom) {
      // Room messages
      const roomRef = doc(db, "rooms", activeId);
      getDoc(roomRef).then(doc => {
        if (doc.exists()) setRoom(doc.data() as Room);
      });
      messagesQuery = query(
        collection(db, "rooms", activeId, "messages"),
        orderBy("createdAt", "asc")
      );
    } else {
      // DM messages
      const dmId = [user.uid, activeId].sort().join("_");
      const userRef = doc(db, "users", activeId);
      getDoc(userRef).then(doc => {
        if (doc.exists()) setTargetUser(doc.data() as UserProfile);
      });
      messagesQuery = query(
        collection(db, "direct_messages", dmId, "messages"),
        orderBy("createdAt", "asc")
      );
    }

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      
      // Handle notifications
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg && lastMsg.senderId !== user.uid && !isTabActive) {
        if (Notification.permission === "granted") {
          new Notification(`New message from ${lastMsg.senderName}`, {
            body: lastMsg.isEncrypted ? "🔒 Encrypted message" : lastMsg.content,
          });
        }
      }

      setMessages(msgs);
      setLoading(false);
      scrollToBottom();
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, isRoom ? `rooms/${activeId}/messages` : `direct_messages/DM_ID/messages`);
    });

    // Request notification permission
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }

    // Tab activity tracking
    const handleVisibilityChange = () => setIsTabActive(!document.hidden);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Periodic lastActive update
    const interval = setInterval(() => {
      if (!document.hidden) updateLastActive();
    }, 60000);

    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(interval);
    };
  }, [user, activeId, isRoom, isTabActive]);

  // Typing indicators listener
  useEffect(() => {
    if (!user || !activeId) return;

    let typingRef;
    if (isRoom) {
      typingRef = collection(db, "rooms", activeId, "typing");
    } else {
      const dmId = [user.uid, activeId].sort().join("_");
      typingRef = collection(db, "direct_messages", dmId, "typing");
    }

    const unsubscribe = onSnapshot(typingRef, (snapshot) => {
      const typing: {[uid: string]: string} = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        // Only show others typing, and only if they typed recently (within 10s)
        if (doc.id !== user.uid && data.isTyping && (Date.now() - data.updatedAt < 10000)) {
          typing[doc.id] = data.displayName || "Someone";
        }
      });
      setTypingUsers(typing);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, isRoom ? `rooms/${activeId}/typing` : `direct_messages/DM_ID/typing`);
    });

    return () => unsubscribe();
  }, [user, activeId, isRoom]);

  const setTypingStatus = async (isTyping: boolean) => {
    if (!user || !activeId) return;
    
    let typingDocRef;
    if (isRoom) {
      typingDocRef = doc(db, "rooms", activeId, "typing", user.uid);
    } else {
      const dmId = [user.uid, activeId].sort().join("_");
      typingDocRef = doc(db, "direct_messages", dmId, "typing", user.uid);
    }

    try {
      if (isTyping) {
        await setDoc(typingDocRef, {
          uid: user.uid,
          displayName: profile?.displayName || user.displayName || "Anonymous",
          isTyping: true,
          updatedAt: Date.now()
        }, { merge: true });
      } else {
        await setDoc(typingDocRef, {
          isTyping: false,
          updatedAt: Date.now()
        }, { merge: true });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, isRoom ? `rooms/${activeId}/typing/${user.uid}` : `direct_messages/DM_ID/typing/${user.uid}`);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      setTypingStatus(true);
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      setTypingStatus(false);
    }, 3000);
  };

  // Mark messages as read
  useEffect(() => {
    if (!user || !messages.length || !isTabActive) return;

    const unreadMessages = messages.filter(m => 
      m.senderId !== user.uid && 
      (!m.readBy || !m.readBy.includes(user.uid))
    );

    if (unreadMessages.length > 0) {
      unreadMessages.forEach(async (msg) => {
        try {
          let messageRef;
          if (isRoom) {
            messageRef = doc(db, "rooms", activeId!, "messages", msg.id);
          } else {
            const dmId = [user.uid, activeId!].sort().join("_");
            messageRef = doc(db, "direct_messages", dmId, "messages", msg.id);
          }
          await updateDoc(messageRef, {
            readBy: arrayUnion(user.uid)
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, isRoom ? `rooms/${activeId}/messages/${msg.id}` : `direct_messages/DM_ID/messages/${msg.id}`);
        }
      });
    }
  }, [messages, user, isTabActive, isRoom, activeId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newMessage.trim() || !user || !activeId) return;

    const messageContent = newMessage.trim();
    setNewMessage("");
    
    // Clear typing status
    if (isTypingRef.current) {
      isTypingRef.current = false;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      setTypingStatus(false);
    }

    try {
      const finalContent = isEncrypted && chatPassword 
        ? encryptMessage(messageContent, chatPassword) 
        : messageContent;

      const messageData: Partial<Message> = {
        senderId: user.uid,
        senderName: profile?.displayName || "Anonymous",
        content: finalContent,
        type: 'text',
        createdAt: Date.now(),
        isEncrypted: isEncrypted && !!chatPassword
      };

      if (isRoom) {
        await addDoc(collection(db, "rooms", activeId, "messages"), messageData);
      } else {
        const dmId = [user.uid, activeId].sort().join("_");
        await addDoc(collection(db, "direct_messages", dmId, "messages"), messageData);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, isRoom ? `rooms/${activeId}/messages` : `direct_messages/DM_ID/messages`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !activeId) return;

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");

    if (!isImage && !isVideo) {
      alert("Only images and videos are allowed.");
      return;
    }

    setUploading(true);
    try {
      const storageRef = ref(storage, `chats/${activeId}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      const messageData: Partial<Message> = {
        senderId: user.uid,
        senderName: profile?.displayName || "Anonymous",
        content: isImage ? "Sent an image" : "Sent a video",
        type: isImage ? 'image' : 'video',
        mediaUrl: url,
        createdAt: Date.now(),
      };

      if (isRoom) {
        await addDoc(collection(db, "rooms", activeId, "messages"), messageData);
      } else {
        const dmId = [user.uid, activeId].sort().join("_");
        await addDoc(collection(db, "direct_messages", dmId, "messages"), messageData);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, isRoom ? `rooms/${activeId}/messages` : `direct_messages/DM_ID/messages`);
    } finally {
      setUploading(false);
    }
  };

  const startRecording = async (type: 'video' | 'audio') => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: type === 'video', 
        audio: true 
      });
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: type === 'video' ? 'video/webm' : 'audio/webm' });
        const file = new File([blob], `recording.${type === 'video' ? 'webm' : 'weba'}`, { type: blob.type });
        
        // Reuse upload logic
        setUploading(true);
        try {
          const storageRef = ref(storage, `chats/${activeId}/${Date.now()}_recording.${type === 'video' ? 'webm' : 'weba'}`);
          await uploadBytes(storageRef, file);
          const url = await getDownloadURL(storageRef);

          const messageData: Partial<Message> = {
            senderId: user.uid,
            senderName: profile?.displayName || "Anonymous",
            content: `Sent a ${type}`,
            type: type === 'video' ? 'video' : 'text', // We'll treat audio as text with link for now or just video
            mediaUrl: url,
            createdAt: Date.now(),
          };

          if (isRoom) {
            await addDoc(collection(db, "rooms", activeId, "messages"), messageData);
          } else {
            const dmId = [user.uid, activeId].sort().join("_");
            await addDoc(collection(db, "direct_messages", dmId, "messages"), messageData);
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, isRoom ? `rooms/${activeId}/messages` : `direct_messages/DM_ID/messages`);
        } finally {
          setUploading(false);
          stream.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingType(type);
    } catch (err) {
      console.error("Error accessing media devices:", err);
      alert("Could not access camera or microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setRecordingType(null);
    }
  };

  const handleBlockUser = async () => {
    if (!user || !targetUser) return;
    const isBlocked = profile?.blockedUsers.includes(targetUser.uid);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        blockedUsers: isBlocked ? arrayRemove(targetUser.uid) : arrayUnion(targetUser.uid)
      });
      setShowOptions(false);
    } catch (err) {
      console.error("Error blocking/unblocking user:", err);
    }
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!user || !activeId) return;

    const message = messages.find(m => m.id === messageId);
    if (!message) return;

    const currentReactions = message.reactions || {};
    const userReactions = currentReactions[emoji] || [];
    
    let newReactions;
    if (userReactions.includes(user.uid)) {
      // Remove reaction
      newReactions = {
        ...currentReactions,
        [emoji]: userReactions.filter(uid => uid !== user.uid)
      };
      // Clean up empty emoji arrays
      if (newReactions[emoji].length === 0) {
        delete newReactions[emoji];
      }
    } else {
      // Add reaction
      newReactions = {
        ...currentReactions,
        [emoji]: [...userReactions, user.uid]
      };
    }

    try {
      let messageRef;
      if (isRoom) {
        messageRef = doc(db, "rooms", activeId, "messages", messageId);
      } else {
        const dmId = [user.uid, activeId].sort().join("_");
        messageRef = doc(db, "direct_messages", dmId, "messages", messageId);
      }
      await updateDoc(messageRef, { reactions: newReactions });
      setActiveReactionMessageId(null);
    } catch (err) {
      console.error("Error updating reaction:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-neutral-950">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isBlocked = !isRoom && targetUser && profile?.blockedUsers.includes(targetUser.uid);
  const hasBlockedMe = !isRoom && targetUser && targetUser.blockedUsers.includes(user.uid);

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 overflow-hidden">
      {/* Header */}
      <header className="h-16 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-4 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="lg:hidden p-2 hover:bg-neutral-800 rounded-full">
            <ArrowLeft size={20} />
          </button>
          <div className="w-10 h-10 bg-neutral-800 rounded-full flex items-center justify-center font-bold">
            {isRoom ? "#" : (targetUser?.username?.charAt(0).toUpperCase() || "?")}
          </div>
          <div>
            <h3 className="font-bold text-white leading-none">
              {isRoom ? room?.name : (targetUser?.displayName || "Anonymous")}
            </h3>
            <div className="h-4 mt-1">
              <AnimatePresence mode="wait">
                {Object.keys(typingUsers).length > 0 ? (
                  <motion.p 
                    key="typing"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="text-xs text-blue-400 font-medium flex items-center gap-1"
                  >
                    <span className="flex gap-0.5">
                      <span className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                    {Object.values(typingUsers).length === 1 
                      ? `${Object.values(typingUsers)[0]} is typing...`
                      : `${Object.values(typingUsers).length} people are typing...`}
                  </motion.p>
                ) : (
                  <motion.p 
                    key="status"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="text-xs text-neutral-500 flex items-center gap-1"
                  >
                    {isRoom ? (
                      `${room?.members.length} members`
                    ) : (
                      <>
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          targetUser && (Date.now() - targetUser.lastActive < 60000) ? "bg-green-500" : "bg-neutral-600"
                        )} />
                        {targetUser && (Date.now() - targetUser.lastActive < 60000) 
                          ? "Online" 
                          : `Last active ${targetUser ? formatDistanceToNow(targetUser.lastActive) : "unknown"} ago`}
                      </>
                    )}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
        <div className="relative">
          <button 
            onClick={() => setShowOptions(!showOptions)}
            className="p-2 hover:bg-neutral-800 rounded-full text-neutral-400"
          >
            <MoreVertical size={20} />
          </button>
          <AnimatePresence>
            {showOptions && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute right-0 mt-2 w-48 bg-neutral-800 border border-neutral-700 rounded-xl shadow-xl z-20 overflow-hidden"
              >
                {!isRoom && (
                  <button 
                    onClick={handleBlockUser}
                    className="w-full px-4 py-3 text-left text-sm hover:bg-neutral-700 flex items-center gap-2 text-red-400"
                  >
                    <ShieldAlert size={16} /> {isBlocked ? "Unblock User" : "Block User"}
                  </button>
                )}
                <button className="w-full px-4 py-3 text-left text-sm hover:bg-neutral-700 flex items-center gap-2">
                  <X size={16} /> Clear Chat
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
        {messages.map((msg, idx) => {
          const isMe = msg.senderId === user.uid;
          const showSender = !isMe && (idx === 0 || messages[idx-1].senderId !== msg.senderId);
          
          return (
            <div key={msg.id} className={cn("flex flex-col group", isMe ? "items-end" : "items-start")}>
              {showSender && isRoom && (
                <span className="text-xs text-neutral-500 mb-1 ml-1">{msg.senderName}</span>
              )}
              <div className="relative flex items-end gap-2 group">
                {!isMe && (
                  <button 
                    onClick={() => setActiveReactionMessageId(activeReactionMessageId === msg.id ? null : msg.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-neutral-800 rounded-full text-neutral-500 transition-all"
                  >
                    <Smile size={16} />
                  </button>
                )}
                <div className={cn(
                  "max-w-[80%] p-3 rounded-2xl shadow-sm relative",
                  isMe ? "bg-blue-600 text-white rounded-tr-none" : "bg-neutral-800 text-neutral-100 rounded-tl-none"
                )}>
                  {msg.type === 'image' && (
                    <img src={msg.mediaUrl} alt="Sent image" className="rounded-lg mb-2 max-h-64 object-cover" referrerPolicy="no-referrer" />
                  )}
                  {msg.type === 'video' && (
                    <video src={msg.mediaUrl} controls className="rounded-lg mb-2 max-h-64" />
                  )}
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {msg.isEncrypted 
                      ? (chatPassword ? decryptMessage(msg.content, chatPassword) : "🔒 Encrypted Message (Enter password to view)")
                      : msg.content
                    }
                  </p>
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <span className="text-[10px] opacity-50 block">
                      {format(msg.createdAt, "HH:mm")}
                    </span>
                    {isMe && (
                      <div className="flex items-center">
                        {msg.readBy && (isRoom ? msg.readBy.length > 0 : msg.readBy.includes(activeId!)) ? (
                          <CheckCheck size={14} className="text-blue-400" />
                        ) : (
                          <Check size={14} className="text-neutral-400" />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Reaction Picker Popover */}
                  <AnimatePresence>
                    {activeReactionMessageId === msg.id && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 10 }}
                        className={cn(
                          "absolute z-20 bottom-full mb-2 bg-neutral-800 border border-neutral-700 rounded-full p-1 flex gap-1 shadow-xl",
                          isMe ? "right-0" : "left-0"
                        )}
                      >
                        {['👍', '❤️', '😂', '😮', '😢', '🔥'].map(emoji => (
                          <button 
                            key={emoji}
                            onClick={() => handleReaction(msg.id, emoji)}
                            className="hover:bg-neutral-700 p-1.5 rounded-full transition-colors text-lg leading-none"
                          >
                            {emoji}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                {isMe && (
                  <button 
                    onClick={() => setActiveReactionMessageId(activeReactionMessageId === msg.id ? null : msg.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-neutral-800 rounded-full text-neutral-500 transition-all"
                  >
                    <Smile size={16} />
                  </button>
                )}
              </div>

              {/* Reactions Display */}
              {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                <div className={cn("flex flex-wrap gap-1 mt-1", isMe ? "justify-end" : "justify-start")}>
                  {Object.entries(msg.reactions).map(([emoji, uids]) => {
                    const userUids = uids as string[];
                    return (
                      <button
                        key={emoji}
                        onClick={() => handleReaction(msg.id, emoji)}
                        className={cn(
                          "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all",
                          userUids.includes(user.uid)
                            ? "bg-blue-600/20 border-blue-500/50 text-blue-400"
                            : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-700"
                        )}
                      >
                        <span>{emoji}</span>
                        <span className="font-bold">{userUids.length}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-neutral-900 border-t border-neutral-800 space-y-3">
        {isEncrypted && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="flex items-center gap-2"
          >
            <div className="flex-1 relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500" size={14} />
              <input 
                type="password"
                value={chatPassword}
                onChange={(e) => setChatPassword(e.target.value)}
                placeholder="Encryption Password (must match for both users)"
                className="w-full bg-neutral-800 border border-blue-500/30 rounded-lg pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </motion.div>
        )}

        {isRecording ? (
          <div className="flex items-center justify-between bg-red-500/10 p-3 rounded-xl border border-red-500/20">
            <div className="flex items-center gap-3 text-red-400 animate-pulse">
              <div className="w-2 h-2 bg-red-500 rounded-full" />
              <span className="text-sm font-medium">Recording {recordingType}...</span>
            </div>
            <button 
              onClick={stopRecording}
              className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-lg transition-colors"
            >
              <StopCircle size={20} />
            </button>
          </div>
        ) : (isBlocked || hasBlockedMe) ? (
          <div className="bg-neutral-800 p-3 rounded-xl text-center text-sm text-neutral-500">
            {isBlocked ? "You have blocked this user." : "This user has blocked you."}
          </div>
        ) : (
          <form onSubmit={handleSendMessage} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-neutral-400 transition-colors"
                title="Upload File"
              >
                <Paperclip size={20} />
              </button>
              <button 
                type="button"
                onClick={() => startRecording('video')}
                className="p-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-neutral-400 transition-colors"
                title="Record Video"
              >
                <Camera size={20} />
              </button>
              <button 
                type="button"
                onClick={() => startRecording('audio')}
                className="p-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-neutral-400 transition-colors"
                title="Record Audio"
              >
                <Mic size={20} />
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
                accept="image/*,video/*"
              />
              <input 
                type="text"
                value={newMessage}
                onChange={handleInputChange}
                placeholder={isEncrypted ? "Type an encrypted message..." : "Type a message..."}
                className={cn(
                  "flex-1 bg-neutral-800 border rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 transition-all",
                  isEncrypted ? "border-blue-500/50 focus:ring-blue-500" : "border-neutral-700 focus:ring-blue-500"
                )}
              />
              <button 
                type="button"
                onClick={() => setIsEncrypted(!isEncrypted)}
                className={cn(
                  "p-3 rounded-xl transition-all",
                  isEncrypted ? "bg-blue-600 text-white" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                )}
                title={isEncrypted ? "Encryption Enabled" : "Enable Encryption"}
              >
                {isEncrypted ? <Lock size={20} /> : <Unlock size={20} />}
              </button>
              <button 
                type="submit"
                disabled={!newMessage.trim() && !uploading}
                className="p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send size={20} />
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
