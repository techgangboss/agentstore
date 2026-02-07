import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Terminal, Upload, LayoutDashboard, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

export function Navbar() {
  const navigate = useNavigate();
  const { user, publisher, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-md">
      <div className="w-full px-6 sm:px-8 lg:px-12 xl:px-16">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-tr from-teal-500 to-cyan-400 rounded-lg flex items-center justify-center">
              <Terminal className="w-5 h-5 text-black" />
            </div>
            <span className="font-bold text-xl tracking-tight text-white">AgentStore</span>
          </Link>
          <div className="hidden md:block">
            <div className="flex items-center space-x-4">
              <a href="/#about" className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors">About</a>
              <a href="/#marketplace" className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors">Marketplace</a>
              <a href="/#builders" className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors">Publishers</a>
              <a href="/#for-agents" className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors">For Agents</a>

              {user && publisher ? (
                <>
                  <Link
                    to="/dashboard"
                    className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    Dashboard
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="ml-2 w-9 h-9 bg-teal-500/20 rounded-full flex items-center justify-center hover:bg-teal-500/30 transition-colors">
                        <span className="text-teal-400 font-semibold text-sm">
                          {publisher.display_name?.[0]?.toUpperCase() || 'P'}
                        </span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-[#1a1a1a] border-white/10 w-48">
                      <div className="px-3 py-2">
                        <p className="text-sm font-medium text-white truncate">{publisher.display_name}</p>
                        <p className="text-xs text-gray-400 truncate">{user.email}</p>
                      </div>
                      <DropdownMenuSeparator className="bg-white/10" />
                      <DropdownMenuItem
                        className="text-gray-300 hover:text-white cursor-pointer"
                        onClick={() => navigate('/submit')}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Submit Agent
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-gray-300 hover:text-white cursor-pointer"
                        onClick={() => navigate('/dashboard')}
                      >
                        <LayoutDashboard className="w-4 h-4 mr-2" />
                        Dashboard
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-white/10" />
                      <DropdownMenuItem
                        className="text-gray-300 hover:text-white cursor-pointer"
                        onClick={handleSignOut}
                      >
                        <LogOut className="w-4 h-4 mr-2" />
                        Sign Out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                <Link
                  to="/submit"
                  className="ml-2 inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg border border-white/10 transition-all"
                >
                  <Upload className="w-4 h-4" />
                  Submit Agent
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
