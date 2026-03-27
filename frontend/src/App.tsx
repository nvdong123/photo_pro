import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { ErrorBoundary } from './components/ErrorBoundary';

// Frontend Pages
import Landing from './pages/frontend/Landing';
import Albums from './pages/frontend/Albums';
import Cart from './pages/frontend/Cart';
import Checkout from './pages/frontend/Checkout';
import Delivery from './pages/frontend/Delivery';
import Results from './pages/frontend/Results';
import Success from './pages/frontend/Success';
import FaceSearch from './pages/frontend/FaceSearch';
import Lookup from './pages/frontend/Lookup';
import Download from './pages/frontend/Download';
import FrontendLayout from './pages/frontend/FrontendLayout';

// Dashboard Pages
import DashboardLayout from './pages/dashboard/DashboardLayout';
import DashboardHome from './pages/dashboard/DashboardHome';
import Locations from './pages/dashboard/Locations';
import Orders from './pages/dashboard/Orders';
import Revenue from './pages/dashboard/Revenue';
import Settings from './pages/dashboard/Settings';
import Profile from './pages/dashboard/Profile';
import Staff from './pages/dashboard/Staff';
import Pricing from './pages/dashboard/Pricing';
import StaffStats from './pages/dashboard/StaffStats';
import StaffUpload from './pages/dashboard/StaffUpload';
import Payroll from './pages/dashboard/Payroll';
import MyEarnings from './pages/dashboard/MyEarnings';

// Auth Pages
import Login from './pages/Login';

// Error Pages
import NotFound from './pages/errors/NotFound';

import './pages/styles/frontend.css';

function App() {
  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#1a6b4e', colorLink: '#1a6b4e' } }}>
    <Router>
      <Routes>
        {/* Frontend Routes (with shared dark navbar) */}
        <Route element={<FrontendLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/albums" element={<Albums />} />
          <Route path="/face-search" element={<FaceSearch />} />
          <Route path="/lookup" element={<Lookup />} />
          <Route path="/results" element={<Results />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/delivery" element={<Delivery />} />
          <Route path="/success" element={<Success />} />
          <Route path="/d/:token" element={<Download />} />
        </Route>

        {/* Auth Routes */}
        <Route path="/login" element={<Login />} />

        {/* Dashboard Routes */}
        <Route path="/dashboard" element={<ErrorBoundary><DashboardLayout /></ErrorBoundary>}>
          <Route index element={<DashboardHome />} />
          <Route path="locations" element={<Locations />} />
          <Route path="orders" element={<Orders />} />
          <Route path="revenue" element={<Revenue />} />
          <Route path="settings" element={<Settings />} />
          <Route path="profile" element={<Profile />} />
          <Route path="staff" element={<Staff />} />
          <Route path="pricing" element={<Pricing />} />
          <Route path="staff-stats" element={<StaffStats />} />
          <Route path="staff-upload" element={<StaffUpload />} />
          <Route path="payroll" element={<Payroll />} />
          <Route path="my-earnings" element={<MyEarnings />} />
        </Route>

        {/* Error Pages */}
        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" />} />
      </Routes>
    </Router>
    </ConfigProvider>
  );
}

export default App;
