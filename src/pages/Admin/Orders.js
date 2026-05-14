import React, { useState, useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { collection, query, orderBy, getDocs, doc, updateDoc, where, onSnapshot, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { 
  FiSearch, FiFilter, FiMoreVertical, FiEdit, FiTrash2, FiEye, FiDownload, 
  FiTruck, FiX, FiCheck, FiClock, FiPackage, FiDollarSign,
  FiShoppingBag, FiAlertCircle, FiTrendingUp, FiCalendar, FiRefreshCw,
  FiCheckCircle, FiCreditCard
} from 'react-icons/fi';
import { useAuth } from '../../contexts/AuthContext';
import { downloadInvoice, viewInvoice } from '../../utils/invoiceGenerator';
import Pagination from '../../components/common/Pagination';
import tpcService from '../../services/tpcCourierService';
import './Orders.css';

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [activeTab, setActiveTab] = useState('all');
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [dateRange, setDateRange] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [specialFilter, setSpecialFilter] = useState(null); // 'pending_payments', 'refund_requests'
  const [statusFilter, setStatusFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [viewingOrder, setViewingOrder] = useState(null);
  const [viewingCancellation, setViewingCancellation] = useState(null);
  const [viewingRefund, setViewingRefund] = useState(null);
  const [trackingData, setTrackingData] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState(null);
  const { currentUser } = useAuth();
  const location = useLocation();

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  useEffect(() => {
    setLoading(true);
    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef, orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setOrders(ordersData);
      setLoading(false);

      // Handle query param filter
      const params = new URLSearchParams(location.search);
      const filterParam = params.get('filter');
      if (filterParam === 'refund_requests' || filterParam === 'cancellation_requests') {
        setSpecialFilter(filterParam);
        setActiveTab('issues');
      } else if (filterParam === 'pending_payments') {
        setSpecialFilter('pending_payments');
        setActiveTab('all');
      }
    }, (error) => {
      console.error('Error fetching orders:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [location.search]);

  // Sync searchTerm with URL param 'q'
  useEffect(() => {
    const q = searchParams.get('q') || '';
    if (q !== searchTerm) {
      setSearchTerm(q);
    }
  }, [searchParams]);

  const handleSearchChange = (value) => {
    setSearchTerm(value);
    setSearchParams(prev => {
      if (value) prev.set('q', value);
      else prev.delete('q');
      return prev;
    }, { replace: true });
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (activeDropdown && !event.target.closest('.action-cell')) {
        setActiveDropdown(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [activeDropdown]);

  // Calculate comprehensive stats
  const calculateStats = () => {
    if (!orders || orders.length === 0) {
      return {
        totalRevenue: 0,
        todayOrders: 0,
        pendingPayments: 0,
        cancellationRequests: 0,
        avgOrderValue: 0,
        total: 0,
        pending: 0,
        processing: 0,
        delivered: 0,
        cancelled: 0
      };
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const totalRevenue = orders
      .filter(o => o.status?.toLowerCase() === 'delivered')
      .reduce((sum, order) => sum + (Number(order.totalAmount || order.total) || 0), 0);

    const todayOrders = orders.filter(o => {
      if (!o.createdAt) return false;
      const orderDate = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
      return orderDate >= today;
    }).length;

    const pendingPayments = orders.filter(o =>
      o.paymentMethod === 'cod' &&
      o.status?.toLowerCase() === 'delivered' &&
      !o.paymentReceived
    ).length;

    const cancellationRequests = orders.filter(o =>
      o.cancellationRequest?.status === 'pending' || o.status?.toLowerCase() === 'cancellation_requested'
    ).length;

    const refundRequests = orders.filter(o =>
      o.refundRequest?.status === 'pending'
    ).length;

    const completedOrders = orders.filter(o => o.status?.toLowerCase() === 'delivered');
    const avgOrderValue = completedOrders.length > 0
      ? totalRevenue / completedOrders.length
      : 0;

    return {
      totalRevenue,
      todayOrders,
      pendingPayments,
      cancellationRequests,
      avgOrderValue,
      total: orders.length,
      pending: orders.filter(o => o.status?.toLowerCase() === 'pending').length,
      processing: orders.filter(o => ['accepted', 'processing', 'packed', 'shipped'].includes(o.status?.toLowerCase())).length,
      delivered: orders.filter(o => o.status?.toLowerCase() === 'delivered').length,
      cancelled: orders.filter(o => o.status?.toLowerCase() === 'cancelled').length,
      refundRequests
    };
  };

  const stats = calculateStats();

  const handleStatClick = (type) => {
    switch(type) {
      case 'revenue':
        setActiveTab('completed');
        setSpecialFilter(null);
        break;
      case 'today':
        setDateRange('today');
        setActiveTab('all');
        setSpecialFilter(null);
        break;
      case 'pending_payments':
        setSpecialFilter('pending_payments');
        setActiveTab('all');
        break;
      case 'cancellation_requests':
        setActiveTab('issues');
        setSpecialFilter('cancellation_requests');
        break;
      case 'refund_requests':
        setActiveTab('issues');
        setSpecialFilter('refund_requests');
        break;
      default:
        setActiveTab('all');
        setSpecialFilter(null);
    }
    // Scroll to table
    document.querySelector('.om-orders-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setPaymentFilter('all');
    setDateRange('all');
    setSpecialFilter(null);
    setActiveTab('all');
    setCurrentPage(1);
  };

  const handleBulkStatusUpdate = async (newStatus) => {
    if (selectedOrders.length === 0) return;
    
    if (!window.confirm(`Are you sure you want to update ${selectedOrders.length} orders to ${newStatus}?`)) {
      return;
    }

    setLoading(true);
    try {
      const promises = selectedOrders.map(orderId => 
        updateDoc(doc(db, 'orders', orderId), {
          status: newStatus,
          statusUpdatedAt: serverTimestamp(),
          statusUpdatedBy: currentUser.email
        })
      );
      await Promise.all(promises);
      setSelectedOrders([]);
      alert(`Successfully updated ${selectedOrders.length} orders.`);
    } catch (error) {
      console.error('Error updating orders:', error);
      alert('Failed to update some orders.');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkExport = () => {
    if (selectedOrders.length === 0) return;
    
    const selectedData = orders.filter(o => selectedOrders.includes(o.id));
    const csvContent = [
      ['Order ID', 'Customer', 'Email', 'Phone', 'Amount', 'Status', 'Payment', 'Date'],
      ...selectedData.map(o => [
        o.id,
        o.customerName || 'Guest',
        o.email,
        o.phone || o.phoneNumber || (o.shippingAddress?.phone) || '',
        o.totalAmount || o.total,
        o.status,
        o.paymentMethod,
        formatDate(o.createdAt)
      ])
    ].map(e => e.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `orders_export_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, {
        status: newStatus,
        statusUpdatedAt: serverTimestamp(),
        statusUpdatedBy: currentUser.email
      });
      alert(`Order status updated to ${newStatus}`);
    } catch (error) {
      console.error("Error updating order status:", error);
      alert('Failed to update order status');
    }
  };

  const handleTrackOrder = async (podNo) => {
    setTrackingLoading(true);
    setTrackingError(null);
    setTrackingData(null);
    try {
      const result = await tpcService.trackOrder(podNo);
      setTrackingData(result);
    } catch (error) {
      console.error("Error tracking order:", error);
      setTrackingError(error.message);
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleApproveCancellation = async (orderId) => {
    if (!window.confirm('Are you sure you want to APPROVE this cancellation?')) return;
    
    try {
      const orderRef = doc(db, 'orders', orderId);
      const order = orders.find(o => o.id === orderId);
      
      const updateData = {
        status: 'Cancelled',
        statusUpdatedAt: serverTimestamp(),
        statusUpdatedBy: currentUser.email,
        'cancellationRequest.status': 'approved',
        'cancellationRequest.approvedAt': serverTimestamp(),
        'cancellationRequest.approvedBy': currentUser.email
      };

      if (order.paymentStatus === 'Paid') {
        updateData.refundStatus = 'Initiated';
        updateData.paymentStatus = 'Refund Processing';
      }

      await updateDoc(orderRef, updateData);
      setViewingCancellation(null);
      alert('Cancellation approved successfully.');
    } catch (error) {
      console.error("Error approving cancellation:", error);
      alert('Failed to approve cancellation');
    }
  };

  const handleRejectCancellation = async (orderId) => {
    const reason = window.prompt('Please provide a reason for rejecting the cancellation request:');
    if (reason === null) return;

    try {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, {
        'cancellationRequest.status': 'rejected',
        'cancellationRequest.rejectedAt': serverTimestamp(),
        'cancellationRequest.rejectedBy': currentUser.email,
        'cancellationRequest.rejectionReason': reason,
        status: 'Accepted' // Revert to accepted status
      });
      setViewingCancellation(null);
      alert('Cancellation request rejected.');
    } catch (error) {
      console.error("Error rejecting cancellation:", error);
      alert('Failed to reject cancellation');
    }
  };

  const handleApproveRefund = async (orderId) => {
    if (!window.confirm('Are you sure you want to APPROVE this refund request?')) return;
    
    try {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, {
        status: 'Returned',
        'refundRequest.status': 'approved',
        'refundRequest.approvedAt': serverTimestamp(),
        'refundRequest.approvedBy': currentUser.email,
        refundStatus: 'Initiated',
        paymentStatus: 'Refund Processing'
      });
      setViewingRefund(null);
      alert('Refund request approved. Order status set to Returned.');
    } catch (error) {
      console.error("Error approving refund:", error);
      alert('Failed to approve refund request.');
    }
  };

  const handleRejectRefund = async (orderId) => {
    const reason = window.prompt('Please provide a reason for rejecting the refund request:');
    if (reason === null) return;

    try {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, {
        'refundRequest.status': 'rejected',
        'refundRequest.rejectedAt': serverTimestamp(),
        'refundRequest.rejectedBy': currentUser.email,
        'refundRequest.rejectionReason': reason
      });
      setViewingRefund(null);
      alert('Refund request rejected.');
    } catch (error) {
      console.error("Error rejecting refund:", error);
      alert('Failed to reject refund request.');
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const getStatusClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'pending': return 'status-pending';
      case 'accepted': return 'status-accepted';
      case 'confirmed': return 'status-confirmed';
      case 'processing': return 'status-processing';
      case 'packed': return 'status-packed';
      case 'shipped': return 'status-shipped';
      case 'delivered': return 'status-delivered';
      case 'cancelled': return 'status-cancelled';
      case 'refunded': return 'status-refunded';
      case 'returned': return 'status-returned';
      default: return 'status-pending';
    }
  };

  const filteredOrders = orders.filter((order, index) => {
    // Search filter
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase().trim();
    const searchWithoutHash = searchLower.startsWith('#') ? searchLower.slice(1) : searchLower;
    
    // Display ID is calculated as orders.length - index (since orders is sorted desc)
    const displayId = String(orders.length - index);

    const matchesSearch = 
      displayId.includes(searchWithoutHash) ||
      order.id.toLowerCase().includes(searchLower) ||
      (order.orderSerial && String(order.orderSerial).includes(searchWithoutHash)) ||
      (order.consignment_no && order.consignment_no.toLowerCase().includes(searchLower)) ||
      (order.customerName || '').toLowerCase().includes(searchLower) ||
      (order.email || '').toLowerCase().includes(searchLower) ||
      (order.phone || order.phoneNumber || order.shippingAddress?.phone || '').includes(searchTerm) ||
      (order.items || []).some(item => (item.name || '').toLowerCase().includes(searchLower)) ||
      (order.status || '').toLowerCase().includes(searchLower) ||
      (order.paymentMethod || '').toLowerCase().includes(searchLower) ||
      (order.shippingAddress?.city || '').toLowerCase().includes(searchLower) ||
      (order.shippingAddress?.locality || '').toLowerCase().includes(searchLower) ||
      (order.shippingAddress?.address || '').toLowerCase().includes(searchLower) ||
      String(order.totalAmount || order.total || '').includes(searchTerm);

    if (!matchesSearch) return false;

    // Tab filter
    if (activeTab === 'active') {
      if (!['pending', 'accepted', 'processing', 'packed', 'shipped'].includes(order.status?.toLowerCase())) return false;
    } else if (activeTab === 'completed') {
      if (order.status?.toLowerCase() !== 'delivered') return false;
    } else if (activeTab === 'issues') {
      if (order.status?.toLowerCase() !== 'cancelled' && order.cancellationRequest?.status !== 'pending' && order.status?.toLowerCase() !== 'cancellation_requested') return false;
    }

    // Special filters from stats
    if (specialFilter === 'pending_payments') {
      if (!(order.paymentMethod === 'cod' && order.status?.toLowerCase() === 'delivered' && !order.paymentReceived)) return false;
    } else if (specialFilter === 'cancellation_requests') {
      if (!(order.cancellationRequest?.status === 'pending' || order.status?.toLowerCase() === 'cancellation_requested')) return false;
    } else if (specialFilter === 'refund_requests') {
      if (!(order.refundRequest?.status === 'pending')) return false;
    }

    // Date range filter
    if (dateRange !== 'all') {
      if (!order.createdAt) return false;
      const orderDate = order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
      const now = new Date();
      if (dateRange === 'today') {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (orderDate < today) return false;
      } else if (dateRange === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (orderDate < weekAgo) return false;
      } else if (dateRange === 'month') {
        const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        if (orderDate < monthAgo) return false;
      }
    }

    // Status Filter
    if (statusFilter !== 'all') {
      if (order.status?.toLowerCase() !== statusFilter.toLowerCase()) return false;
    }

    // Payment Filter
    if (paymentFilter !== 'all') {
      if (paymentFilter === 'cod' && order.paymentMethod !== 'cod') return false;
      if (paymentFilter === 'online' && order.paymentMethod === 'cod') return false;
      if (paymentFilter === 'paid' && order.paymentStatus !== 'Paid') return false;
      if (paymentFilter === 'pending' && order.paymentStatus === 'Paid') return false;
    }

    return true;
  }).sort((a, b) => {
    const getTime = (d) => {
        if (!d) return 0;
        if (d.toDate) return d.toDate().getTime();
        if (d.seconds) return d.seconds * 1000;
        return new Date(d).getTime() || 0;
    };
    return getTime(b.createdAt) - getTime(a.createdAt);
  });

  // Calculate pagination
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab, dateRange, paymentFilter, statusFilter, specialFilter]);

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="loading-spinner"></div>
        <p>Loading orders...</p>
      </div>
    );
  }

  return (
    <div className="order-management">
      {/* Header */}
      <div className="om-header">
        <div className="om-header-left">
          <h1 className="om-title">Order Management & Invoices</h1>
          <p className="om-subtitle">Track orders, manage shipments, and download invoices</p>
        </div>
        <div className="om-header-right">
          <div className="om-search-box">
            <FiSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search orders, customers, phone..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
          <button 
            className={`om-filter-toggle ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
            title="Toggle Filters"
          >
            <FiFilter />
          </button>
          <div className="om-admin-profile">
            <div className="admin-avatar">
              {currentUser?.photoURL ? (
                <img src={currentUser.photoURL} alt="Admin" />
              ) : (
                <span>{currentUser?.displayName?.charAt(0) || 'A'}</span>
              )}
            </div>
            <div className="admin-info">
              <span className="admin-name">{currentUser?.displayName || 'Admin'}</span>
              <span className="admin-email">{currentUser?.email || 'admin@satva.com'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="om-filter-panel">
          <div className="filter-group">
            <label>Order Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="processing">Processing</option>
              <option value="packed">Packed</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Payment Method</label>
            <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
              <option value="all">All Methods</option>
              <option value="cod">Cash on Delivery</option>
              <option value="online">Online Payment</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Date Range</label>
            <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
          </div>

          <button className="clear-filters-btn" onClick={clearFilters}>
            <FiX /> Clear Filters
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="om-stats-header">
        <h2 className="section-title">Business Overview</h2>
        <div className="date-range-selector">
          <button className={dateRange === 'today' ? 'active' : ''} onClick={() => setDateRange('today')}>
            <FiCalendar /> Today
          </button>
          <button className={dateRange === 'week' ? 'active' : ''} onClick={() => setDateRange('week')}>
            This Week
          </button>
          <button className={dateRange === 'month' ? 'active' : ''} onClick={() => setDateRange('month')}>
            This Month
          </button>
          <button className={dateRange === 'all' ? 'active' : ''} onClick={() => setDateRange('all')}>
            All Time
          </button>
        </div>
      </div>

      <div className="om-stats">
        <div className="stat-card stat-revenue" onClick={() => handleStatClick('revenue')}>
          <div className="stat-icon-wrapper green">
            <FiDollarSign />
          </div>
          <div className="stat-content">
            <p className="stat-label">Total Revenue</p>
            <h2 className="stat-value">{formatCurrency(stats.totalRevenue)}</h2>
            <span className="stat-change positive">
              <FiTrendingUp /> +12.5%
            </span>
          </div>
        </div>

        <div className="stat-card stat-today" onClick={() => handleStatClick('today')}>
          <div className="stat-icon-wrapper blue">
            <FiShoppingBag />
          </div>
          <div className="stat-content">
            <p className="stat-label">Today's Orders</p>
            <h2 className="stat-value">{stats.todayOrders}</h2>
            <span className="stat-change positive">
              <FiTrendingUp /> +8.2%
            </span>
          </div>
        </div>

        <div className="stat-card stat-pending-payment" onClick={() => handleStatClick('pending_payments')}>
          <div className="stat-icon-wrapper orange">
            <FiAlertCircle />
          </div>
          <div className="stat-content">
            <p className="stat-label">Pending Payments</p>
            <h2 className="stat-value">{stats.pendingPayments}</h2>
            <span className="stat-change neutral">COD Orders</span>
          </div>
        </div>

        <div className="stat-card stat-refund" onClick={() => handleStatClick('cancellation_requests')}>
          <div className="stat-icon-wrapper red">
            <FiRefreshCw />
          </div>
          <div className="stat-content">
            <p className="stat-label">Cancellation Requests</p>
            <h2 className="stat-value">{stats.cancellationRequests}</h2>
            <span className="stat-change neutral">Pending Review</span>
          </div>
        </div>
      </div>

      {/* Orders Section */}
      <div className="om-orders-section">
        {/* Tabs */}
        <div className="om-tabs-wrapper">
          <div className="om-tabs">
            <button className={`om-tab ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>
              All Orders <span className="tab-count">{stats.total}</span>
            </button>
            <button className={`om-tab ${activeTab === 'active' ? 'active' : ''}`} onClick={() => setActiveTab('active')}>
              Active <span className="tab-count">{stats.processing + stats.pending}</span>
            </button>
            <button className={`om-tab ${activeTab === 'completed' ? 'active' : ''}`} onClick={() => setActiveTab('completed')}>
              Completed <span className="tab-count">{stats.delivered}</span>
            </button>
            <button className={`om-tab ${activeTab === 'issues' ? 'active' : ''}`} onClick={() => setActiveTab('issues')}>
              Issues <span className="tab-count">{stats.cancelled + stats.cancellationRequests + stats.refundRequests}</span>
            </button>
          </div>
        </div>

        {/* Bulk Actions Bar */}
        {selectedOrders.length > 0 && (
          <div className="bulk-actions-bar">
            <div className="bulk-info">
              <FiCheckCircle />
              <span>{selectedOrders.length} orders selected</span>
            </div>
            <div className="bulk-btns">
              <select 
                className="bulk-select" 
                onChange={(e) => handleBulkStatusUpdate(e.target.value)}
                defaultValue=""
              >
                <option value="" disabled>Update Status</option>
                <option value="Accepted">Accept</option>
                <option value="Processing">Process</option>
                <option value="Packed">Pack</option>
                <option value="Shipped">Ship</option>
                <option value="Delivered">Deliver</option>
                <option value="Cancelled">Cancel</option>
              </select>
              <button className="bulk-btn" onClick={handleBulkExport}>
                <FiDownload /> Export CSV
              </button>
              <button className="bulk-btn danger" onClick={() => {
                if (window.confirm(`Are you sure you want to DELETE ${selectedOrders.length} orders? This cannot be undone.`)) {
                  // Bulk delete logic
                  const deletePromises = selectedOrders.map(id => deleteDoc(doc(db, 'orders', id)));
                  Promise.all(deletePromises).then(() => {
                    setSelectedOrders([]);
                    alert('Orders deleted successfully');
                  });
                }
              }}>
                <FiTrash2 /> Delete
              </button>
              <button className="bulk-btn-close" onClick={() => setSelectedOrders([])}>
                <FiX />
              </button>
            </div>
          </div>
        )}

        {/* Orders Table */}
        {filteredOrders.length > 0 ? (
          <div className="om-table-container">
            <table className="om-table">
              <thead>
                <tr>
                  <th className="checkbox-col">
                    <input
                      type="checkbox"
                      checked={selectedOrders.length === filteredOrders.length && filteredOrders.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedOrders(filteredOrders.map(o => o.id));
                        } else {
                          setSelectedOrders([]);
                        }
                      }}
                    />
                  </th>
                  <th>Sr. No.</th>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Amount</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedOrders.map((order, index) => {
                  const firstItem = order.items?.[0];
                  const isSelected = selectedOrders.includes(order.id);
                  
                  // Adjust index for pagination
                  const displayIndex = (currentPage - 1) * itemsPerPage + index + 1;
                  
                  return (
                    <tr 
                      key={order.id} 
                      className={isSelected ? 'selected' : ''}
                      style={{ zIndex: activeDropdown === order.id ? 100 : 1, position: 'relative' }}
                    >
                      <td className="checkbox-col">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedOrders([...selectedOrders, order.id]);
                            } else {
                              setSelectedOrders(selectedOrders.filter(id => id !== order.id));
                            }
                          }}
                        />
                      </td>
                      <td>
                        <span className="sr-no-text">{displayIndex}</span>
                      </td>
                      <td>
                        <div className="order-id-cell">
                          <span className="order-id-text">#{orders.length - orders.findIndex(o => o.id === order.id)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="customer-cell">
                          <span className="customer-name">{order.customerName || 'Guest'}</span>
                          <span className="customer-email">{order.email}</span>
                          <span className="customer-phone">📞 {order.phone || order.phoneNumber || (order.shippingAddress?.phone) || 'N/A'}</span>
                        </div>
                      </td>
                      <td>
                        <div className="items-cell-new" onClick={() => setViewingOrder(order)}>
                          {firstItem && (
                            <div className="first-item-row">
                              <span className="item-name-preview">{firstItem.name}</span>
                              {order.items?.length > 1 && (
                                <div 
                                  className="items-tooltip-trigger"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setViewingOrder(order);
                                  }}
                                  style={{ cursor: 'pointer' }}
                                >
                                  <span className="more-items-tag">+ {order.items.length - 1} more items</span>
                                  <div className="items-tooltip">
                                    {order.items.slice(1).map((item, i) => (
                                      <div key={i} className="tooltip-item">{item.name} (x{item.quantity})</div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="amount-cell">
                          <span className="amount-value">{formatCurrency(order.totalAmount || order.total)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="payment-cell">
                          <span className={`payment-badge ${order.paymentMethod?.toLowerCase()}`}>
                            {order.paymentMethod === 'cod' ? 'COD' : 'Paid'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="status-badge-container">
                          <span className={`status-badge ${getStatusClass(order.status)}`}>
                            {order.status || 'Pending'}
                          </span>
                          {(order.cancellationRequest?.status === 'pending' || order.status?.toLowerCase() === 'cancellation_requested') && (
                            <div 
                              className="cancellation-badge clickable" 
                              onClick={() => setViewingCancellation(order)}
                              title="Click to view cancellation details"
                              style={{ 
                                backgroundColor: '#fff7ed', 
                                color: '#ea580c', 
                                fontSize: '10px', 
                                fontWeight: 'bold', 
                                padding: '2px 6px', 
                                borderRadius: '4px', 
                                marginTop: '4px',
                                textAlign: 'center',
                                border: '1px solid #fdba74'
                              }}
                            >
                              Cancellation Requested
                            </div>
                          )}
                          {order.refundRequest?.status === 'pending' && (
                            <div 
                              className="refund-badge clickable" 
                              onClick={() => setViewingRefund(order)}
                              title="Click to view refund details"
                              style={{ 
                                backgroundColor: '#fee2e2', 
                                color: '#ef4444', 
                                fontSize: '10px', 
                                fontWeight: 'bold', 
                                padding: '2px 6px', 
                                borderRadius: '4px', 
                                marginTop: '4px',
                                textAlign: 'center',
                                border: '1px solid #fca5a5'
                              }}
                            >
                              Refund Requested
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="date-text">{formatDate(order.createdAt)}</span>
                      </td>
                      <td>
                        <div className="action-cell">
                          {/* Context-Based Actions */}
                          {(order.cancellationRequest?.status === 'pending' || order.status?.toLowerCase() === 'cancellation_requested') ? (
                            <>
                              <button 
                                className="action-icon-btn success" 
                                onClick={() => handleApproveCancellation(order.id)}
                                title="Approve Cancellation"
                              >
                                <FiCheck />
                              </button>
                              <button 
                                className="action-icon-btn danger" 
                                onClick={() => handleRejectCancellation(order.id)}
                                title="Reject Cancellation"
                              >
                                <FiX />
                              </button>
                            </>
                          ) : order.refundRequest?.status === 'pending' ? (
                            <>
                              <button 
                                className="action-icon-btn success" 
                                onClick={() => handleApproveRefund(order.id)}
                                title="Approve Refund"
                              >
                                <FiCheck />
                              </button>
                              <button 
                                className="action-icon-btn danger" 
                                onClick={() => handleRejectRefund(order.id)}
                                title="Reject Refund"
                              >
                                <FiX />
                              </button>
                            </>
                          ) : order.status?.toLowerCase() === 'pending' ? (
                            <>
                              <button 
                                className="action-icon-btn success" 
                                onClick={() => updateOrderStatus(order.id, 'Accepted')}
                                title="Accept Order"
                              >
                                <FiCheck />
                              </button>
                              <button 
                                className="action-icon-btn danger" 
                                onClick={() => {
                                  if (window.confirm('Are you sure you want to CANCEL this order?')) {
                                    updateOrderStatus(order.id, 'Cancelled');
                                  }
                                }}
                                title="Cancel Order"
                              >
                                <FiTrash2 />
                              </button>
                            </>
                          ) : (
                            <button 
                              className="action-icon-btn" 
                              onClick={() => downloadInvoice(order)}
                              title="Download Invoice"
                            >
                              <FiDownload />
                            </button>
                          )}
                          
                          <button 
                            className="action-icon-btn info" 
                            onClick={() => setViewingOrder(order)}
                            title="View Details"
                          >
                            <FiEye />
                          </button>

                          <button
                            className="action-menu-btn"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setActiveDropdown(activeDropdown === order.id ? null : order.id);
                            }}
                          >
                            <FiMoreVertical />
                          </button>
                          
                          {activeDropdown === order.id && (
                            <div className="action-dropdown">
                              <button className="dropdown-item" onClick={() => { setViewingOrder(order); setActiveDropdown(null); }}>
                                <FiEye /> View Details
                              </button>
                              
                              {order.status?.toLowerCase() === 'pending' && (
                                <button className="dropdown-item success" onClick={() => { updateOrderStatus(order.id, 'Accepted'); setActiveDropdown(null); }}>
                                  <FiCheck /> Accept Order
                                </button>
                              )}

                              {(order.status?.toLowerCase() === 'accepted' || order.status?.toLowerCase() === 'processing') && (
                                <>
                                  <button className="dropdown-item info" onClick={() => { updateOrderStatus(order.id, 'Packed'); setActiveDropdown(null); }}>
                                    <FiPackage /> Mark as Packed
                                  </button>
                                  <button className="dropdown-item info" onClick={() => { updateOrderStatus(order.id, 'Shipped'); setActiveDropdown(null); }}>
                                    <FiTruck /> Ship Order
                                  </button>
                                </>
                              )}

                              {order.status?.toLowerCase() === 'shipped' && (
                                <button className="dropdown-item primary" onClick={() => { updateOrderStatus(order.id, 'Delivered'); setActiveDropdown(null); }}>
                                  <FiPackage /> Mark Delivered
                                </button>
                              )}

                              <button className="dropdown-item" onClick={() => { updateOrderStatus(order.id, 'Processing'); setActiveDropdown(null); }}>
                                <FiEdit /> Update Status
                              </button>
                              
                              {(order.cancellationRequest?.status === 'pending' || order.status?.toLowerCase() === 'cancellation_requested') ? (
                                <>
                                  <button className="dropdown-item success" onClick={() => { handleApproveCancellation(order.id); setActiveDropdown(null); }}>
                                    <FiCheck /> Approve Cancel
                                  </button>
                                  <button className="dropdown-item danger" onClick={() => { handleRejectCancellation(order.id); setActiveDropdown(null); }}>
                                    <FiX /> Reject Cancel
                                  </button>
                                </>
                              ) : (
                                <button className="dropdown-item danger" onClick={() => {
                                  if (window.confirm('Are you sure you want to CANCEL this order?')) {
                                    updateOrderStatus(order.id, 'Cancelled');
                                  }
                                  setActiveDropdown(null);
                                }}>
                                  <FiTrash2 /> Cancel Order
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination 
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              totalResults={filteredOrders.length}
              itemsPerPage={itemsPerPage}
            />
          </div>
        ) : (
          <div className="empty-state">
            <FiPackage size={64} />
            <h3>No Orders Found</h3>
            <p>
              {searchTerm || activeTab !== 'all' 
                ? 'No orders match your search criteria.' 
                : 'No orders have been placed yet.'}
            </p>
          </div>
        )}
      </div>

      {/* Order Details Modal */}
      {viewingOrder && (
        <div className="modal-overlay" onClick={() => setViewingOrder(null)}>
          <div className="modal-content-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="header-title-group">
                <h2>Order Details</h2>
                <span className="order-id-badge">#{orders.length - orders.findIndex(o => o.id === viewingOrder.id)}</span>
              </div>
              <button className="close-btn" onClick={() => setViewingOrder(null)}><FiX /></button>
            </div>
            <div className="modal-body">
              {(viewingOrder.cancellationRequest?.status === 'pending' || viewingOrder.status?.toLowerCase() === 'cancellation_requested') && (
                <div className="cancellation-alert-box">
                  <div className="alert-content">
                    <h4><FiAlertCircle /> Cancellation Requested</h4>
                    <p><strong>Reason:</strong> "{viewingOrder.cancellationRequest?.reason || 'No reason provided'}"</p>
                    <p className="alert-time">Requested on: {formatDate(viewingOrder.cancellationRequest?.requestedAt)}</p>
                  </div>
                  <div className="alert-actions">
                    <button className="btn-approve-sm" onClick={() => handleApproveCancellation(viewingOrder.id)}>
                      <FiCheck /> Approve
                    </button>
                    <button className="btn-reject-sm" onClick={() => handleRejectCancellation(viewingOrder.id)}>
                      <FiX /> Reject
                    </button>
                  </div>
                </div>
              )}
              <div className="order-details-grid-new">
                <div className="details-main">
                  {/* Customer Info */}
                  <div className="detail-card">
                    <h3><FiShoppingBag /> Customer Information</h3>
                    <div className="info-grid">
                      <div className="info-item">
                        <label>Name</label>
                        <span>{viewingOrder.customerName || 'Guest'}</span>
                      </div>
                      <div className="info-item">
                        <label>Email</label>
                        <span>{viewingOrder.email}</span>
                      </div>
                      <div className="info-item">
                        <label>Phone</label>
                        <span>{viewingOrder.phone || viewingOrder.phoneNumber || (viewingOrder.shippingAddress?.phone) || 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Address */}
                  <div className="detail-card">
                    <h3><FiTruck /> Delivery Address</h3>
                    <div className="address-box">
                      {viewingOrder.shippingAddress ? (
                        <>
                          <p className="address-street">{viewingOrder.shippingAddress.address}</p>
                          <p className="address-city">{viewingOrder.shippingAddress.city}, {viewingOrder.shippingAddress.state}</p>
                          <p className="address-pincode">PIN: {viewingOrder.shippingAddress.pincode}</p>
                        </>
                      ) : viewingOrder.address ? (
                        <>
                          <p className="address-street">{viewingOrder.address.street || viewingOrder.address.address}</p>
                          <p className="address-city">{viewingOrder.address.city}, {viewingOrder.address.state}</p>
                          <p className="address-pincode">PIN: {viewingOrder.address.pincode}</p>
                        </>
                      ) : (
                        <p className="no-address">No address provided</p>
                      )}
                    </div>
                  </div>

                  {/* Items */}
                  <div className="detail-card">
                    <h3><FiPackage /> Order Items</h3>
                    <table className="items-table-new">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Quantity</th>
                          <th>Price</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewingOrder.items?.map((item, idx) => (
                          <tr key={idx}>
                            <td>{item.name}</td>
                            <td>{item.quantity}</td>
                            <td>{formatCurrency(item.price)}</td>
                            <td>{formatCurrency(item.price * item.quantity)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan="3">Subtotal</td>
                          <td>{formatCurrency(viewingOrder.items?.reduce((acc, item) => acc + item.price*item.quantity, 0) || 0)}</td>
                        </tr>
                        <tr>
                          <td colSpan="3">Delivery & Shipping Charge</td>
                          <td>{formatCurrency(27)}</td>
                        </tr>
                        {viewingOrder.gstTotal > 0 && (
                          <tr>
                            <td colSpan="3">GST</td>
                            <td>{formatCurrency(viewingOrder.gstTotal)}</td>
                          </tr>
                        )}
                        <tr className="grand-total-row">
                          <td colSpan="3">Grand Total</td>
                          <td>{formatCurrency(viewingOrder.totalAmount || viewingOrder.total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                <div className="details-sidebar">
                  <div className={`status-badge-large ${getStatusClass(viewingOrder.status)}`}>
                    {viewingOrder.status?.toUpperCase()}
                  </div>

                  <div className="detail-card">
                    <h3><FiClock /> Timeline</h3>
                    <div className="status-timeline">
                      <div className="timeline-item-new">
                        <div className="timeline-dot active"></div>
                        <div className="timeline-content-new">
                          <p className="timeline-label">Ordered On</p>
                          <p className="timeline-time">{formatDate(viewingOrder.createdAt)}</p>
                        </div>
                      </div>
                      {viewingOrder.statusUpdatedAt && (
                        <div className="timeline-item-new">
                          <div className="timeline-dot active"></div>
                          <div className="timeline-content-new">
                            <p className="timeline-label">Last Updated</p>
                            <p className="timeline-time">{formatDate(viewingOrder.statusUpdatedAt)}</p>
                            {viewingOrder.statusUpdatedBy && (
                              <p className="timeline-by">by {viewingOrder.statusUpdatedBy}</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="detail-card">
                    <h3><FiCreditCard /> Payment Info</h3>
                    <div className="payment-info-box">
                      <div className="info-row">
                        <label>Method</label>
                        <span className="method-tag">{viewingOrder.paymentMethod?.toUpperCase()}</span>
                      </div>
                      <div className="info-row">
                        <label>Status</label>
                        <span className={`payment-status ${viewingOrder.paymentStatus?.toLowerCase()}`}>
                          {viewingOrder.paymentStatus || 'Pending'}
                        </span>
                      </div>
                      {viewingOrder.paymentId && (
                        <div className="info-row">
                          <label>ID</label>
                          <span className="payment-id-text">{viewingOrder.paymentId}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {(viewingOrder.consignment_no || viewingOrder.tracking_id) && (
                    <div className="detail-card">
                      <h3><FiTruck /> Tracking Info</h3>
                      <div className="payment-info-box">
                        <div className="info-row">
                          <label>POD No</label>
                          <span className="payment-id-text">{viewingOrder.consignment_no || viewingOrder.tracking_id}</span>
                        </div>
                        <button 
                          className="btn-secondary" 
                          onClick={() => handleTrackOrder(viewingOrder.consignment_no || viewingOrder.tracking_id)}
                          disabled={trackingLoading}
                          style={{ width: '100%', marginTop: '10px' }}
                        >
                          {trackingLoading ? 'Tracking...' : 'Track Location'}
                        </button>
                        {trackingError && <p style={{ color: 'red', fontSize: '12px', marginTop: '5px' }}>{trackingError}</p>}
                        {trackingData && (
                          <div style={{ marginTop: '10px', fontSize: '12px' }}>
                            {Array.isArray(trackingData) ? (
                              <ul style={{ listStyle: 'none', padding: 0 }}>
                                {trackingData.map((step, idx) => (
                                  <li key={idx} style={{ marginBottom: '5px', paddingBottom: '5px', borderBottom: '1px solid #eee' }}>
                                    <div style={{ fontWeight: 'bold' }}>{step.STATUS || step.status}</div>
                                    <div style={{ color: '#666' }}>{step.LOCATION || step.location}</div>
                                    <div style={{ color: '#999', fontSize: '10px' }}>{step.DATE || step.date}</div>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <pre style={{ overflowX: 'auto' }}>{JSON.stringify(trackingData, null, 2)}</pre>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => viewInvoice(viewingOrder)}>
                <FiEye /> Preview Invoice
              </button>
              <button className="btn-primary" onClick={() => downloadInvoice(viewingOrder)}>
                <FiDownload /> Download Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Details Modal */}
      {viewingCancellation && (
        <div className="modal-overlay" onClick={() => setViewingCancellation(null)}>
          <div className="modal-content-small" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Cancellation Request</h3>
              <button className="close-btn" onClick={() => setViewingCancellation(null)}><FiX /></button>
            </div>
            <div className="modal-body">
              <div className="cancel-info-box">
                <div className="detail-row">
                  <span>Order ID:</span>
                  <strong>#{viewingCancellation.id.substring(0, 10).toUpperCase()}</strong>
                </div>
                <div className="detail-row">
                  <span>Requested By:</span>
                  <strong>{viewingCancellation.customerName || 'Customer'}</strong>
                </div>
                <div className="detail-row">
                  <span>Requested On:</span>
                  <strong>{formatDate(viewingCancellation.cancellationRequest?.requestedAt)}</strong>
                </div>
                <div className="reason-row">
                  <span>Reason for Cancellation:</span>
                  <div className="reason-text">
                    "{viewingCancellation.cancellationRequest?.reason || 'No reason provided'}"
                  </div>
                </div>
              </div>

              <div className="cancellation-actions-large">
                <p className="action-hint">Approving will cancel the order and initiate refund if paid.</p>
                <div className="action-buttons-group">
                  <button 
                    className="btn-approve-large"
                    onClick={() => handleApproveCancellation(viewingCancellation.id)}
                  >
                    <FiCheck /> Approve Cancellation
                  </button>
                  <button 
                    className="btn-reject-large"
                    onClick={() => handleRejectCancellation(viewingCancellation.id)}
                  >
                    <FiX /> Reject Request
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Refund Details Modal */}
      {viewingRefund && (
        <div className="modal-overlay" onClick={() => setViewingRefund(null)}>
          <div className="modal-content-small" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Refund Request</h3>
              <button className="close-btn" onClick={() => setViewingRefund(null)}><FiX /></button>
            </div>
            <div className="modal-body">
              <div className="cancel-info-box">
                <div className="detail-row">
                  <span>Order ID:</span>
                  <strong>#{viewingRefund.id.substring(0, 10).toUpperCase()}</strong>
                </div>
                <div className="detail-row">
                  <span>Customer:</span>
                  <strong>{viewingRefund.customerName || 'Customer'}</strong>
                </div>
                <div className="detail-row">
                  <span>Requested On:</span>
                  <strong>{formatDate(viewingRefund.refundRequest?.requestedAt)}</strong>
                </div>
                <div className="reason-row">
                  <span>Reason for Refund:</span>
                  <div className="reason-text">
                    "{viewingRefund.refundRequest?.reason || 'No reason provided'}"
                  </div>
                </div>
                {viewingRefund.refundRequest?.note && (
                  <div className="reason-row">
                    <span>Additional Note:</span>
                    <div className="reason-text">
                      "{viewingRefund.refundRequest.note}"
                    </div>
                  </div>
                )}
                {viewingRefund.refundRequest?.photo && (
                  <div className="reason-row">
                    <span>Product Photo:</span>
                    <div className="refund-photo-container" style={{ marginTop: '10px', textAlign: 'center' }}>
                      <img 
                        src={viewingRefund.refundRequest.photo} 
                        alt="Product Issue" 
                        style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px', cursor: 'zoom-in' }}
                        onClick={() => window.open(viewingRefund.refundRequest.photo, '_blank')}
                      />
                      <p style={{ fontSize: '11px', color: '#666', marginTop: '5px' }}>Click image to view full size</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="cancellation-actions-large">
                <p className="action-hint">Approving will mark order as Returned and initiate refund.</p>
                <div className="action-buttons-group">
                  <button 
                    className="btn-approve-large"
                    style={{ backgroundColor: '#22c55e' }}
                    onClick={() => handleApproveRefund(viewingRefund.id)}
                  >
                    <FiCheck /> Approve Refund
                  </button>
                  <button 
                    className="btn-reject-large"
                    onClick={() => handleRejectRefund(viewingRefund.id)}
                  >
                    <FiX /> Reject Request
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orders;
