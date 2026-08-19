import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { useApp } from './context/AppContext'

import Home from './pages/Home'
import PostDetail from './pages/PostDetail'
import CreatePost from './pages/CreatePost'
import Search from './pages/Search'
import Login from './pages/Login'
import Register from './pages/Register'
import Profile from './pages/Profile'
import EditProfile from './pages/EditProfile'
import Match from './pages/Match'
import MatchResult from './pages/MatchResult'
import MatchHistory from './pages/MatchHistory'
import LlmSettings from './pages/LlmSettings'
import Chat from './pages/Chat'
import ChatDetail from './pages/ChatDetail'
import Messages from './pages/Messages'
import Friends from './pages/Friends'
import Admin from './pages/Admin'
import Announcements from './pages/Announcements'

function RequireAuth({ children }) {
  const { user, authReady } = useApp()
  if (!authReady) return null // 等待会话恢复，避免闪烁
  if (!user) return <Navigate to="/login" replace />
  return children
}

function RequireAdmin({ children }) {
  const { user, authReady } = useApp()
  if (!authReady) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/announcements" element={<Announcements />} />
        <Route path="/post/:id" element={<PostDetail />} />
        <Route path="/search" element={<Search />} />
        <Route path="/profile/:id" element={<Profile />} />

        <Route path="/create" element={<RequireAuth><CreatePost /></RequireAuth>} />
        <Route path="/profile/edit" element={<RequireAuth><EditProfile /></RequireAuth>} />
        <Route path="/match" element={<RequireAuth><Match /></RequireAuth>} />
        <Route path="/match/result/:id" element={<RequireAuth><MatchResult /></RequireAuth>} />
        <Route path="/match/history" element={<RequireAuth><MatchHistory /></RequireAuth>} />
        <Route path="/settings/llm" element={<RequireAuth><LlmSettings /></RequireAuth>} />
        <Route path="/chat" element={<RequireAuth><Chat /></RequireAuth>} />
        <Route path="/chat/:userId" element={<RequireAuth><ChatDetail /></RequireAuth>} />
        <Route path="/messages" element={<RequireAuth><Messages /></RequireAuth>} />
        <Route path="/friends/requests" element={<RequireAuth><Friends /></RequireAuth>} />
        <Route path="/admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
