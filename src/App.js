import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import Home from './pages/Home/Home';
import Shop from './pages/Shop/Shop';
import Contact from './pages/Contact/Contact';
import Login from './pages/Auth/Login';
import Signup from './pages/Auth/Signup';
import LoginWithOTP from './pages/Auth/LoginWithOTP';
import OTPVerification from './pages/Auth/OTPVerification';
import ForgotPassword from './pages/Auth/ForgotPassword';
import ResetPassword from './pages/Auth/ResetPassword';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AdminRoute from './components/auth/AdminRoute';
import AccountLayout from './pages/Account/AccountLayout';
import Profile from './pages/Account/Profile';
import UserOrders from './pages/Account/Orders';
import OrderDetails from './pages/Account/OrderDetails';
import Wishlist from './pages/Account/Wishlist';
import Addresses from './pages/Account/Addresses';
import AdminLayout from './pages/Admin/AdminLayout';
import Dashboard from './pages/Admin/Dashboard';
import Products from './pages/Admin/Products';
import AddProduct from './pages/Admin/AddProduct';
import EditProduct from './pages/Admin/EditProduct';
import AdminOrders from './pages/Admin/Orders';
import RefundRequests from './pages/Admin/RefundRequests';
import HeroBanners from './pages/Admin/HeroBanners';
import SpecialOffer from './pages/Admin/SpecialOffer';
import DiscountsAndDeals from './pages/Admin/DiscountsAndDeals';
import Categories from './pages/Admin/Categories';
import Users from './pages/Admin/Users';
import Dispatch from './pages/Admin/Dispatch';
import CourierSettings from './pages/Admin/CourierSettings';
import APILogs from './pages/Admin/APILogs';
import ShippingRates from './pages/Admin/ShippingRates';
import Analytics from './pages/Admin/Analytics';
import MakeAdmin from './components/admin/MakeAdmin';
import ProductDetail from './pages/ProductDetail/ProductDetail';
import FlashDeals from './pages/FlashDeals/FlashDeals';
import Checkout from './pages/Checkout/Checkout';
import Terms from './pages/Terms/Terms';
import Privacy from './pages/Privacy/Privacy';
import RefundPolicy from './pages/RefundPolicy/RefundPolicy';
import CartDrawer from './components/cart/CartDrawer';
import AbandonedCartReminder from './components/cart/AbandonedCartReminder';
import { CategoryProvider } from './contexts/CategoryContext';
import { WishlistProvider } from './contexts/WishlistContext';
import ScrollToTop from './components/common/ScrollToTop';
import './styles/index.css';

import StickyCartBar from './components/cart/StickyCartBar';

// Layout component to wrap pages that need Header and Footer
const Layout = ({ children }) => {
  return (
    <>
      <Header />
      <main className="main-content">
        {children}
      </main>
      <StickyCartBar />
      <Footer />
    </>
  );
};

function App() {
  return (
    <AuthProvider>
      <CategoryProvider>
        <WishlistProvider>
          <CartProvider>
            <Router>
              <ScrollToTop />
            <div className="app">
              <CartDrawer />
              <AbandonedCartReminder />
              <Routes>
                {/* Public Routes with Layout */}
                <Route path="/" element={<Layout><Home /></Layout>} />
                <Route path="/shop/*" element={<Layout><Shop /></Layout>} />
                <Route path="/product/:id" element={<Layout><ProductDetail /></Layout>} />
                <Route path="/flash-deals" element={<Layout><FlashDeals /></Layout>} />
                <Route path="/contact" element={<Layout><Contact /></Layout>} />
                <Route path="/terms" element={<Layout><Terms /></Layout>} />
                <Route path="/privacy" element={<Layout><Privacy /></Layout>} />
                <Route path="/refund-policy" element={<Layout><RefundPolicy /></Layout>} />
                
                {/* Auth Routes (Standalone) */}
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/login-otp" element={<LoginWithOTP />} />
                <Route path="/verify-otp" element={<OTPVerification />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/make-admin" element={<MakeAdmin />} />
                <Route path="/checkout" element={<Layout><Checkout /></Layout>} />
                
                {/* Protected User Dashboard Routes */}
                <Route path="/account" element={
                  <ProtectedRoute>
                    <Layout>
                      <AccountLayout />
                    </Layout>
                  </ProtectedRoute>
                }>
                  <Route index element={<Navigate to="profile" replace />} />
                  <Route path="profile" element={<Profile />} />
                  <Route path="orders" element={<UserOrders />} />
                  <Route path="orders/:id" element={<OrderDetails />} />
                  <Route path="wishlist" element={<Wishlist />} />
                  <Route path="addresses" element={<Addresses />} />
                </Route>
  
                {/* Protected Admin Routes */}
                <Route path="/admin" element={
                  <AdminRoute>
                    <AdminLayout />
                  </AdminRoute>
                }>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="products" element={<Products />} />
                  <Route path="products/add" element={<AddProduct />} />
                  <Route path="products/edit/:id" element={<EditProduct />} />
                  <Route path="refund-requests" element={<RefundRequests />} />
                  <Route path="orders" element={<AdminOrders />} />
                  <Route path="dispatch" element={<Dispatch />} />
                  <Route path="banners" element={<HeroBanners />} />
                  <Route path="special-offer" element={<SpecialOffer />} />
                  <Route path="discounts" element={<DiscountsAndDeals />} />
                  <Route path="categories" element={<Categories />} />
                  <Route path="users" element={<Users />} />
                  <Route path="courier-settings" element={<CourierSettings />} />
                  <Route path="shipping-rates" element={<ShippingRates />} />
                  <Route path="api-logs" element={<APILogs />} />
                  
                  {/* Analytics Routes */}
                  <Route path="analytics" element={<Analytics />} />
                  <Route path="analytics/orders" element={<Analytics />} />
                  <Route path="analytics/products" element={<Analytics />} />
                  <Route path="analytics/customers" element={<Analytics />} />
                  <Route path="analytics/revenue" element={<Analytics />} />
                </Route>
  
                {/* Fallback for other routes */}
                <Route path="*" element={<Layout><Home /></Layout>} />
              </Routes>
            </div>
          </Router>
          </CartProvider>
        </WishlistProvider>
      </CategoryProvider>
    </AuthProvider>
  );
}

export default App;
