import React from 'react'
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import { Layout } from './components/Layout'
import { useApp } from './context/AppContext'

import Landing from './pages/Landing'
import Social from './pages/Social'
import Starlink from './pages/Starlink'
import TagPosts from './pages/TagPosts'
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
import ChatDetail from './pages/ChatDetail'
import Messages from './pages/Messages'
import Friends from './pages/Friends'
import FriendsList from './pages/FriendsList'
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

/* 帖子详情：统一跳转到 Social 页内联展开（保持左栏工具栏不动） */
function PostRedirect() {
  const { id } = useParams()
  return <Navigate to={`/social?post=${id}`} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/landing" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/landing" element={<Landing />} />
      <Route path="/starlink" element={<Starlink />} />
      <Route path="/post/:id" element={<PostRedirect />} />

      <Route element={<Layout />}>
        <Route path="/social" element={<Social />} />
        <Route path="/forum" element={<Navigate to="/social" replace />} />
        <Route path="/tags/:tag" element={<TagPosts />} />
        <Route path="/announcements" element={<Announcements />} />
        <Route path="/search" element={<Search />} />
        <Route path="/profile/:id" element={<Profile />} />

        <Route path="/create" element={<RequireAuth><CreatePost /></RequireAuth>} />
        <Route path="/profile/edit" element={<RequireAuth><EditProfile /></RequireAuth>} />
        <Route path="/match" element={<RequireAuth><Match /></RequireAuth>} />
        <Route path="/match/result/:id" element={<RequireAuth><MatchResult /></RequireAuth>} />
        <Route path="/match/history" element={<RequireAuth><MatchHistory /></RequireAuth>} />
        <Route path="/settings/llm" element={<RequireAuth><LlmSettings /></RequireAuth>} />
        <Route path="/chat" element={<Navigate to="/social" replace />} />
        <Route path="/chat/:userId" element={<RequireAuth><ChatDetail /></RequireAuth>} />
        <Route path="/messages" element={<RequireAuth><Messages /></RequireAuth>} />
        <Route path="/friends/requests" element={<RequireAuth><Friends /></RequireAuth>} />
        <Route path="/friends/list" element={<RequireAuth><FriendsList /></RequireAuth>} />
        <Route path="/admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
