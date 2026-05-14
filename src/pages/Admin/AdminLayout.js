import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../../config/firebase';
import {
  FiGrid, FiBox, FiPackage, FiImage, FiList,
  FiUsers, FiHome, FiLogOut, FiSearch, FiBell, FiTag, FiPercent, FiAlertCircle, FiCheckCircle,
  FiTruck, FiSettings, FiActivity, FiBarChart2, FiPieChart, FiTrendingUp, FiDollarSign, FiShoppingBag, FiRefreshCcw
} from 'react-icons/fi';
import './Admin.css';

const AdminLayout = () => {
  const { logout, currentUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') || '';
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    // Listen for new orders (Processing) and Cancellation Requests
    const ordersRef = collection(db, 'orders');
    
    // We can't do complex OR queries easily in Firestore for different fields without multiple queries
    // So we'll fetch active orders and filter client-side or set up two listeners
    // For simplicity, let's listen to recent orders
    
    const q = query(ordersRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newNotifications = [];
      
      snapshot.docs.forEach(doc => {
        const order = { id: doc.id, ...doc.data() };
        
        // Check for new orders (Pending)
        if (order.status === 'Pending' || order.status === 'Processing') {
          newNotifications.push({
            id: `new-${order.id}`,
            type: 'new_order',
            message: `New Order #${order.id.substring(0, 8).toUpperCase()}`,
            time: order.createdAt,
            link: `/admin/orders/${order.id}`,
            read: false
          });
        }
        
        // Check for cancellation requests
        if (order.cancellationRequest && order.cancellationRequest.status === 'pending') {
          newNotifications.push({
            id: `cancel-${order.id}`,
            type: 'cancellation',
            message: `Cancellation Request: Order #${order.id.substring(0, 8).toUpperCase()}`,
            time: order.cancellationRequest.requestedAt || order.createdAt,
            link: `/admin/orders/${order.id}`,
            read: false
          });
        }
      });
      
      setNotifications(newNotifications);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out', error);
    }
  };

  const menuItems = [
    { path: '/admin/dashboard', icon: <FiGrid />, label: 'Dashboard' },
    { path: '/admin/products', icon: <FiBox />, label: 'Products' },
    { path: '/admin/orders', icon: <FiPackage />, label: 'Orders' },
    { path: '/admin/refund-requests', icon: <FiRefreshCcw />, label: 'Refund Requests' },
    { path: '/admin/dispatch', icon: <FiTruck />, label: 'Dispatch' },
    { path: '/admin/banners', icon: <FiImage />, label: 'Hero Banners' },
    { path: '/admin/special-offer', icon: <FiTag />, label: 'Special Offer' },
    { path: '/admin/discounts', icon: <FiPercent />, label: 'Discounts & Deals' },
    { path: '/admin/categories', icon: <FiList />, label: 'Categories' },
    { path: '/admin/users', icon: <FiUsers />, label: 'Total Customers' },
    { path: '/admin/courier-settings', icon: <FiSettings />, label: 'Courier Settings' },
    { path: '/admin/shipping-rates', icon: <FiTruck />, label: 'Shipping Rates' },
    { path: '/admin/api-logs', icon: <FiActivity />, label: 'API Logs' },
  ];

  const analyticsItems = [
      { path: '/admin/analytics', icon: <FiBarChart2 />, label: 'Overview' },
      { path: '/admin/analytics/orders', icon: <FiShoppingBag />, label: 'Orders Analysis' },
      { path: '/admin/analytics/customers', icon: <FiUsers />, label: 'Customer Analysis' },
      { path: '/admin/analytics/revenue', icon: <FiDollarSign />, label: 'Revenue Analysis' },
  ];

  return (
    <div className="admin-container">
      {/* Sidebar */}
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <h2>Admin Panel</h2>
        </div>

        <nav className="admin-nav">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}

          <div className="admin-nav-divider"></div>
          <div className="admin-nav-header" style={{ 
              padding: '10px 20px', 
              color: '#9ca3af', 
              fontSize: '11px', 
              fontWeight: '700', 
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
          }}>
              Data Analysis
          </div>
          
          {analyticsItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}

          <div className="admin-nav-divider"></div>

          <Link to="/" className="admin-nav-item">
            <FiHome />
            <span>View Website</span>
          </Link>

          <button onClick={handleLogout} className="admin-nav-item logout-btn">
            <FiLogOut />
            <span>Logout</span>
          </button>
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="admin-main">
        {/* Top Bar */}
        <header className="admin-topbar">
          <div className="topbar-search">
            <FiSearch />
            <input 
              type="text" 
              placeholder="Search users, orders, products..." 
              value={searchQuery}
              onChange={(e) => setSearchParams({ q: e.target.value }, { replace: true })}
            />
          </div>

          <div className="topbar-actions">
            <div className="notification-wrapper" style={{ position: 'relative' }}>
              <button 
                type="button"
                className={`notification-btn ${notifications.length > 0 ? 'has-notifications' : ''}`}
                onClick={() => setShowNotifications(!showNotifications)}
                title="View Notifications"
              >
                <FiBell />
                {notifications.length > 0 && (
                  <span className="notification-badge-count">{notifications.length}</span>
                )}
              </button>

              {showNotifications && (
                <div className="notifications-dropdown">
                  <div className="notifications-header">
                    <h3>Notifications</h3>
                    <button onClick={() => setShowNotifications(false)}>Close</button>
                  </div>
                  <div className="notifications-list">
                    {notifications.length === 0 ? (
                      <div className="no-notifications">No new notifications</div>
                    ) : (
                      notifications.map(notif => (
                        <div 
                          key={notif.id} 
                          className={`notification-item ${notif.type}`}
                          onClick={() => {
                            navigate(notif.link);
                            setShowNotifications(false);
                          }}
                        >
                          <div className="notif-icon">
                            {notif.type === 'cancellation' ? <FiAlertCircle color="#ef4444" /> : <FiCheckCircle color="#27ae60" />}
                          </div>
                          <div className="notif-content">
                            <p className="notif-message">{notif.message}</p>
                            <span className="notif-time">
                              {notif.time?.toDate ? notif.time.toDate().toLocaleDateString() : 'Just now'}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="admin-profile-pill">
              <img
                src={currentUser?.photoURL || "https://ui-avatars.com/api/?name=Admin+User&background=059669&color=fff"}
                alt="Profile"
                className="admin-avatar"
              />
              <div className="admin-profile-info">
                <span className="admin-profile-name">{currentUser?.displayName || 'Admin User'}</span>
                <span className="admin-profile-email">{currentUser?.email || 'admin@satva.com'}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
