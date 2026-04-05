import { Outlet, Link, useLocation } from "react-router-dom";
import { User } from "firebase/auth";
import { UserProfile } from "../types";
import { 
  MessageSquare, 
  Users, 
  Search, 
  User as UserIcon, 
  LogOut, 
  Hash,
  Menu,
  X
} from "lucide-react";
import { useState } from "react";
import { logout } from "../lib/auth";
import { cn } from "../lib/utils";

interface LayoutProps {
  user: User;
  profile: UserProfile | null;
}

export default function Layout({ user, profile }: LayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  const navItems = [
    { name: "Chats", path: "/", icon: MessageSquare },
    { name: "Rooms", path: "/rooms", icon: Hash },
    { name: "Search", path: "/search", icon: Search },
    { name: "Profile", path: "/profile", icon: UserIcon },
  ];

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100 overflow-hidden">
      {/* Mobile Sidebar Toggle */}
      <button 
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-neutral-900 rounded-md shadow-lg"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-neutral-900 border-r border-neutral-800 transition-transform duration-300 lg:relative lg:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full p-4">
          <div className="flex items-center gap-3 mb-8 px-2">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-xl">
              A
            </div>
            <h1 className="text-xl font-bold tracking-tight">AnonChat</h1>
          </div>

          <nav className="flex-1 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                    isActive 
                      ? "bg-blue-600 text-white" 
                      : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
                  )}
                >
                  <Icon size={20} />
                  <span className="font-medium">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto pt-4 border-t border-neutral-800">
            <div className="flex items-center gap-3 px-2 mb-4">
              <div className="w-10 h-10 bg-neutral-800 rounded-full flex items-center justify-center text-sm font-medium">
                {profile?.username?.charAt(0).toUpperCase() || "?"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{profile?.displayName || "Anonymous"}</p>
                <p className="text-xs text-neutral-500 truncate">@{profile?.username || "anon"}</p>
              </div>
            </div>
            <button 
              onClick={() => logout()}
              className="flex items-center gap-3 w-full px-3 py-2 text-neutral-400 hover:bg-neutral-800 hover:text-red-400 rounded-lg transition-colors"
            >
              <LogOut size={20} />
              <span className="font-medium">Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 relative flex flex-col min-w-0">
        <Outlet />
      </main>

      {/* Overlay for Mobile Sidebar */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
}
