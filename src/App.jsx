import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { DataProvider } from './contexts/DataContext.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import RequireRole from './components/RequireRole.jsx';
import LoginPage from './pages/LoginPage.jsx';
import LeadershipLayout from './layouts/LeadershipLayout.jsx';
import LearnerLayout from './layouts/LearnerLayout.jsx';
import UserManagementPage from './pages/leadership/UserManagementPage.jsx';
import CourseManagementPage from './pages/leadership/CourseManagementPage.jsx';
import CourseAssignmentPage from './pages/leadership/CourseAssignmentPage.jsx';
import ProgressMonitoringPage from './pages/leadership/ProgressMonitoringPage.jsx';
import AssessmentEditorPage from './pages/leadership/AssessmentEditorPage.jsx';
import ChatListPage from './pages/leadership/ChatListPage.jsx';
import ReviewerManagementPage from './pages/leadership/ReviewerManagementPage.jsx';
import AnalyticsDashboardPage from './pages/leadership/AnalyticsDashboardPage.jsx';
import CohortManagementPage from './pages/leadership/CohortManagementPage.jsx';
import AuditLogPage from './pages/leadership/AuditLogPage.jsx';
import ExerciseEditorPage from './pages/leadership/ExerciseEditorPage.jsx';
import LearnerDashboardPage from './pages/learner/LearnerDashboardPage.jsx';
import CourseDetailPage from './pages/learner/CourseDetailPage.jsx';
import ChapterViewPage from './pages/learner/ChapterViewPage.jsx';
import LeadershipDashboardPage from './pages/leadership/LeadershipDashboardPage.jsx';
import ProfilePage from './pages/learner/ProfilePage.jsx';
import ReviewingPage from './pages/learner/ReviewingPage.jsx';
import ReviewChatsPage from './pages/learner/ReviewChatsPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import ChangePasswordPage from './pages/ChangePasswordPage.jsx';
import AppLoader from './components/AppLoader.jsx';
import './App.css';

function AppRoutes() {
  const { loading: authLoading } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSplashDone(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!splashDone || authLoading) {
    return <AppLoader />;
  }

  return (
    <DataProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireAuth />}>
          <Route path="/change-password" element={<ChangePasswordPage />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route element={<RequireRole role="leadership" />}>
            <Route path="/leadership" element={<LeadershipLayout />}>
              <Route path="dashboard" element={<LeadershipDashboardPage />} />
              <Route path="users" element={<UserManagementPage />} />
              <Route path="courses" element={<CourseManagementPage />} />
              <Route path="assign" element={<CourseAssignmentPage />} />
              <Route path="progress" element={<ProgressMonitoringPage />} />
              <Route path="courses/:courseId/chapters/:chapterId/assessments" element={<AssessmentEditorPage />} />
              <Route path="courses/:courseId/chapters/:chapterId/exercises" element={<ExerciseEditorPage />} />
              <Route path="chats" element={<ChatListPage />} />
              <Route path="reviewers" element={<ReviewerManagementPage />} />
              <Route path="analytics" element={<AnalyticsDashboardPage />} />
              <Route path="cohorts" element={<CohortManagementPage />} />
              <Route path="audit" element={<AuditLogPage />} />
            </Route>
          </Route>
        </Route>

        <Route element={<RequireAuth />}>
          <Route element={<RequireRole role="learner" />}>
            <Route path="/learner" element={<LearnerLayout />}>
              <Route path="dashboard" element={<LearnerDashboardPage />} />
              <Route path="course/:courseId" element={<CourseDetailPage />} />
              <Route path="course/:courseId/chapter/:chapterId" element={<ChapterViewPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="reviewing" element={<ReviewingPage />} />
              <Route path="review-chats" element={<ReviewChatsPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </DataProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
