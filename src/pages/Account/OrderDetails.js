import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, serverTimestamp, collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { downloadInvoice } from '../../utils/invoiceGenerator';
import {
  FiArrowLeft,
  FiDownload,
  FiTruck,
  FiMapPin,
  FiCreditCard,
  FiMessageCircle,
  FiPhone,
  FiStar,
  FiClock,
  FiCheckCircle,
  FiPackage,
  FiInfo,
  FiMail,
  FiChevronRight,
  FiCopy,
  FiXCircle,
  FiActivity
} from 'react-icons/fi';
import tpcService from '../../services/tpcCourierService';
import {
  BsBoxSeam,
  BsCheckCircleFill,
  BsTruck,
  BsPinMapFill,
  BsStarFill,
  BsChatLeftDots,
  BsChevronLeft
} from 'react-icons/bs';
import './Account.css';

const RecentlyViewedProducts = () => {
  const [viewedProducts, setViewedProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchViewed = async () => {
      try {
        const ids = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
        if (ids.length === 0) {
          setLoading(false);
          return;
        }

        // Firestore 'in' query limited to 10
        const q = query(collection(db, 'products'), where('__name__', 'in', ids.slice(0, 10)));
        const snap = await getDocs(q);
        const products = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Sort back to match localStorage order
        const sorted = ids.map(id => products.find(p => p.id === id)).filter(Boolean);
        setViewedProducts(sorted);
      } catch (err) {
        console.error("Error fetching recently viewed:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchViewed();
  }, []);

  if (loading || viewedProducts.length === 0) return null;

  return (
    <div className="recently-viewed-section">
      <h4 className="section-title">Recently Viewed</h4>
      <div className="horizontal-items-scroll">
        {viewedProducts.map((p) => (
          <div key={p.id} className="viewed-item-card" onClick={() => navigate(`/product/${p.id}`)}>
            <div className="item-img-placeholder">
              <img src={p.image || (p.images && p.images[0]?.url) || (p.images && p.images[0])} alt={p.name} />
            </div>
            <p className="item-name">{p.name}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const OrderDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewData, setReviewData] = useState({ rating: 5, comment: '', images: [] });
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingData, setTrackingData] = useState(null);

  const cancelReasons = [
    "Ordered by mistake",
    "Delivery delay",
    "Found better price",
    "Changed my mind",
    "Other"
  ];

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const orderDoc = await getDoc(doc(db, 'orders', id));
        if (orderDoc.exists()) {
          const data = orderDoc.data();
          
          // Calculate serial number based on all orders created up to this point
          const qCount = query(collection(db, 'orders'), where('createdAt', '<=', data.createdAt));
          const countSnap = await getDocs(qCount);
          
          setOrder({ id: orderDoc.id, ...data, orderSerial: countSnap.size });
        } else {
          navigate('/account/orders');
        }
      } catch (error) {
        console.error("Error fetching order details:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [id, navigate]);

  useEffect(() => {
    const podNo = order?.trackingNumber || order?.consignment_no;
    if (order && order.courierName === 'TPC' && podNo) {
      fetchTrackingInfo(podNo);
    }
  }, [order]);

  const fetchTrackingInfo = async (podNo) => {
    try {
      setTrackingLoading(true);
      const result = await tpcService.trackOrder(podNo);
      console.log('📡 TPC Tracking Result:', result);
      setTrackingData(result);
    } catch (error) {
      console.error('Error fetching TPC tracking:', error);
    } finally {
      setTrackingLoading(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    let date;
    try {
      date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      if (isNaN(date.getTime())) return 'Invalid Date';
    } catch (e) {
      return 'N/A';
    }
    return date.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getEstimatedDelivery = (timestamp) => {
    try {
      let date;
      if (timestamp && timestamp.toDate) {
        date = timestamp.toDate();
      } else if (timestamp && timestamp.seconds) {
        date = new Date(timestamp.seconds * 1000);
      } else if (timestamp) {
        date = new Date(timestamp);
      } else {
        date = new Date();
      }

      if (isNaN(date.getTime())) date = new Date(); // Final safety

      date.setDate(date.getDate() + 7);
      return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    } catch (e) {
      return '7-10 Days';
    }
  };

  const formatDateOnly = (timestamp) => {
    try {
      if (!timestamp) return '';
      let date;
      if (timestamp.toDate) {
        date = timestamp.toDate();
      } else if (timestamp.seconds) {
        date = new Date(timestamp.seconds * 1000);
      } else {
        date = new Date(timestamp);
      }

      if (isNaN(date.getTime())) return '';
      return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    } catch (e) {
      return '';
    }
  };

  const getMockDate = (timestamp, daysToAdd) => {
    if (!timestamp) return '';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      date.setDate(date.getDate() + daysToAdd);
      return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    } catch (e) {
      return '';
    }
  };

  const getStatusSteps = () => {
    const steps = [
      { label: 'Ordered', status: 'Pending', icon: <FiClock />, description: 'Order placed successfully' },
      { label: 'Shipped', status: 'Shipped', icon: <FiPackage />, description: 'Order is on the way' },
      { label: 'Out for Delivery', status: 'Out for Delivery', icon: <FiTruck />, description: 'Your order is out for delivery' },
      { label: 'Delivered', status: 'Delivered', icon: <FiCheckCircle />, description: 'Order delivered successfully' }
    ];

    const statusMap = {
      'pending': 0,
      'accepted': 0,
      'confirmed': 0,
      'processing': 0,
      'packed': 0,
      'shipped': 1,
      'out for delivery': 2,
      'delivered': 3,
      'cancelled': -1,
      'cancellation_requested': -2
    };

    const currentStatus = order?.status?.toLowerCase() || 'pending';
    const currentStatusIndex = statusMap[currentStatus] ?? 0;

    return steps.map((step, index) => ({
      ...step,
      isCompleted: currentStatusIndex >= index,
      isActive: currentStatusIndex === index,
      timestamp: index === 0 ? order.createdAt : (currentStatusIndex >= index ? order.statusUpdatedAt : null)
    }));
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(order.id);
    alert('Order ID copied to clipboard!');
  };

  const handleRequestCancellation = async () => {
    if (!cancelReason) {
      alert('Please select a reason for cancellation');
      return;
    }

    setIsCancelling(true);
    try {
      const orderRef = doc(db, 'orders', id);
      await updateDoc(orderRef, {
        status: 'Cancellation_Requested',
        cancellationRequest: {
          reason: cancelReason,
          requestedAt: serverTimestamp(),
          status: 'pending'
        }
      });
      setOrder({
        ...order,
        status: 'Cancellation_Requested',
        cancellationRequest: {
          reason: cancelReason,
          requestedAt: new Date(),
          status: 'pending'
        }
      });
      setShowCancelModal(false);
      alert('Cancellation request submitted successfully. It is now under review.');
    } catch (error) {
      console.error("Error requesting cancellation:", error);
      alert('Failed to submit cancellation request. Please try again.');
    } finally {
      setIsCancelling(false);
    }
  };

  const getStatusBadgeColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'pending': return '#f59e0b';
      case 'accepted':
      case 'confirmed':
      case 'processing': return '#3b82f6';
      case 'shipped': return '#8b5cf6';
      case 'delivered': return '#10b981';
      case 'cancelled': return '#ef4444';
      case 'cancellation_requested': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'reviews'), {
        orderId: id,
        userId: currentUser.uid,
        userName: currentUser.displayName || 'Anonymous',
        ...reviewData,
        createdAt: serverTimestamp()
      });
      setShowReviewForm(false);
      alert('Thank you for your review!');
    } catch (error) {
      console.error("Error submitting review:", error);
    }
  };

  if (loading) {
    return <div className="loading-state"><div className="spinner"></div></div>;
  }

  if (!order) return null;

  const steps = getStatusSteps();

  return (
    <div className="order-details-page">
      {/* Desktop View */}
      <div className="desktop-view">
        <div className="order-details-header-new">
          <div className="header-top">
            <button onClick={() => navigate('/account/orders')} className="btn-back-new">
              <FiArrowLeft />
            </button>
            <div className="order-meta-info">
              <div className="order-id-group">
                <h1>Order #{order.orderSerial || order.id.substring(0, 8).toUpperCase()}</h1>
                <button className="copy-btn" onClick={handleCopyId} title="Copy Order ID">
                  <FiCopy />
                </button>
              </div>
              <p className="order-date-status">
                Placed on {formatDate(order.createdAt)} | Status:
                <span className="status-text-badge" style={{ color: getStatusBadgeColor(order.status) }}>
                  {order.status === 'Cancellation_Requested' ? '🟡 Cancellation Requested' : order.status}
                </span>
                <span className="status-tooltip" title={steps.find(s => s.isActive)?.description || 'Order is being processed'}>
                  <FiInfo />
                </span>
              </p>
            </div>
          </div>
          <div className="header-actions-new">
            <button className="btn-outline" onClick={() => downloadInvoice(order)}>
              <FiDownload /> Invoice
            </button>
            <button className="btn-primary-outline" onClick={() => navigate('/shop')}>
              <FiPackage /> Reorder Items
            </button>
          </div>
        </div>

        <div className="order-main-grid">
          <div className="order-left-col">
            <div className="order-card tracking-card-new">
              <h3 className="card-title">Order Timeline</h3>
              <div className="timeline-container">
                {steps.map((step, index) => (
                  <div key={index} className={`timeline-item ${step.isCompleted ? 'completed' : ''} ${step.isActive ? 'active' : ''}`}>
                    <div className="timeline-icon">
                      {step.isCompleted ? <FiCheckCircle /> : step.icon}
                    </div>
                    <div className="timeline-content">
                      <div className="timeline-header">
                        <span className="timeline-label">{step.label}</span>
                        {step.timestamp && <span className="timeline-time">{formatDate(step.timestamp)}</span>}
                      </div>
                      <p className="timeline-desc">{step.description}</p>
                    </div>
                    {index < steps.length - 1 && <div className="timeline-line"></div>}
                  </div>
                ))}
              </div>

              {order.status?.toLowerCase() === 'cancellation_requested' && (
                <div className="cancellation-notice-new warning">
                  <FiClock /> <strong>Cancellation Requested</strong>
                  <p>Your request is under review. Reason: {order.cancellationRequest?.reason}</p>
                </div>
              )}

              {order.status?.toLowerCase() === 'cancelled' && (
                <div className="cancellation-notice-new danger">
                  <FiXCircle /> <strong>Order Cancelled</strong>
                  <p>This order was cancelled. {order.cancellationRequest?.approvedAt ? `Approved on ${formatDate(order.cancellationRequest.approvedAt)}` : ''}</p>
                </div>
              )}

              {order.cancellationRequest?.status === 'rejected' && (
                <div className="cancellation-notice-new danger">
                  <FiInfo /> <strong>Cancellation Request Rejected</strong>
                  <p>Your cancellation request was rejected. Reason: {order.cancellationRequest.rejectionReason}</p>
                </div>
              )}

              {order.status?.toLowerCase() !== 'delivered' && order.status?.toLowerCase() !== 'cancelled' && (
                <div className="delivery-estimate">
                  <FiTruck /> Expected delivery: <strong>3–5 days from order date</strong>
                </div>
              )}

              {order.courierName === 'TPC' && (order.trackingNumber || order.consignment_no) && (
                <div className="tpc-tracking-section">
                  <h4 className="tracking-subtitle"><FiActivity /> Real-time Tracking (TPC)</h4>
                  {trackingLoading ? (
                    <div className="tracking-loader"><FiClock className="spinner" /> Fetching latest status...</div>
                  ) : trackingData ? (
                    <div className="tracking-info-grid">
                      <div className="tracking-item">
                        <span className="label">POD Number:</span>
                        <span className="value">{order.trackingNumber || order.consignment_no}</span>
                      </div>
                      <div className="tracking-item">
                        <span className="label">Latest Status:</span>
                        <span className="value status-highlight">{trackingData.STATUS || trackingData.status || 'Processed'}</span>
                      </div>
                      {trackingData.LATEST_LOCATION && (
                        <div className="tracking-item">
                          <span className="label">Location:</span>
                          <span className="value">{trackingData.LATEST_LOCATION}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="no-tracking-data">Tracking information currently unavailable.</p>
                  )}
                </div>
              )}
            </div>

            <div className="order-card items-card">
              <h3 className="card-title">Items Ordered ({order.items?.length})</h3>
              <div className="order-items-list">
                {order.items?.map((item, index) => {
                  const itemImage = item.image || (item.images && item.images[0] ? (item.images[0].url || item.images[0]) : '');
                  return (
                    <div key={index} className="order-item-row">
                      <img src={itemImage} alt={item.name} className="item-img" />
                      <div className="item-details">
                        <h4>{item.name}</h4>
                        <p>Size: {item.selectedSize || 'Standard'} | Qty: {item.quantity}</p>
                        <span className="item-price">₹{item.price} × {item.quantity} = ₹{item.price * item.quantity}</span>
                      </div>
                      {order.status === 'Delivered' && (
                        <button className="btn-rate" onClick={() => setShowReviewForm(true)}>
                          Rate & Review
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {showReviewForm && (
              <div className="order-card review-card">
                <h3 className="card-title">Rate & Review Products</h3>
                <form onSubmit={handleReviewSubmit} className="review-form">
                  <div className="rating-input">
                    {[1, 2, 3, 4, 5].map(num => (
                      <FiStar
                        key={num}
                        className={num <= reviewData.rating ? 'star filled' : 'star'}
                        onClick={() => setReviewData({ ...reviewData, rating: num })}
                      />
                    ))}
                  </div>
                  <textarea
                    placeholder="Share your experience with this product..."
                    value={reviewData.comment}
                    onChange={(e) => setReviewData({ ...reviewData, comment: e.target.value })}
                    required
                  />
                  <div className="form-actions">
                    <button type="button" className="btn-cancel" onClick={() => setShowReviewForm(false)}>Cancel</button>
                    <button type="submit" className="btn-submit">Submit Review</button>
                  </div>
                </form>
              </div>
            )}
          </div>

          <div className="order-right-col">
            <div className="order-card info-card-new">
              <h3 className="card-title"><FiCreditCard /> Payment Details</h3>
              <div className="payment-details-content">
                <div className="payment-method-info">
                  <div className="method-icon">
                    {order.paymentMethod === 'cod' ? <FiClock /> : <FiCheckCircle className="success" />}
                  </div>
                  <div className="method-text">
                    <p className="method-name">{order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Paid Online (Razorpay)'}</p>
                    {order.paymentId && <p className="transaction-id">Transaction ID: {order.paymentId}</p>}
                  </div>
                </div>
                <div className={`payment-status-badge ${order.paymentStatus?.toLowerCase()}`}>
                  {order.paymentStatus || 'Pending'}
                </div>
              </div>
            </div>

            <div className="order-card info-card-new">
              <h3 className="card-title"><FiMapPin /> Delivery Address</h3>
              <div className="address-content-new">
                {order.shippingAddress ? (
                  <>
                    <p className="customer-name">{order.shippingAddress.name}</p>
                    <p className="address-text">
                      {order.shippingAddress.address}, {order.shippingAddress.locality}<br />
                      {order.shippingAddress.city}, {order.shippingAddress.state} - <strong>{order.shippingAddress.pincode}</strong>
                    </p>
                    <p className="phone">📞 {order.shippingAddress.phone}</p>
                  </>
                ) : order.address ? (
                  <>
                    <p className="customer-name">{order.customerName}</p>
                    <p className="address-text">
                      {order.address.street || order.address.address}<br />
                      {order.address.city}, {order.address.state} - <strong>{order.address.pincode}</strong>
                    </p>
                    <p className="phone">📞 {order.phone || order.phoneNumber}</p>
                  </>
                ) : (
                  <p className="no-address">No address information available</p>
                )}
              </div>
            </div>

            <div className="order-card summary-card-new">
              <h3 className="card-title">Price Details</h3>
              <div className="price-breakdown">
                <div className="price-row">
                  <span>Items Total</span>
                  <span>₹{(order.items || []).reduce((acc, item) => acc + (item.price * item.quantity), 0).toLocaleString()}</span>
                </div>
                {order.gstTotal > 0 && (
                  <div className="price-row">
                    <span>Tax (GST)</span>
                    <span>₹{order.gstTotal.toLocaleString()}</span>
                  </div>
                )}
                {/* Calculate other charges as the difference */}
                {(() => {
                  const itemsPrice = (order.items || []).reduce((acc, item) => acc + (item.price * item.quantity), 0);
                  const otherCharges = (order.totalAmount || 0) - itemsPrice - (order.gstTotal || 0);
                  if (otherCharges > 0) {
                    return (
                      <div className="price-row">
                        <span>Delivery & Handling</span>
                        <span>₹{otherCharges.toLocaleString()}</span>
                      </div>
                    );
                  }
                  return (
                    <div className="price-row">
                      <span>Delivery Fee</span>
                      <span className="success">FREE</span>
                    </div>
                  );
                })()}
                <div className="price-row total-row">
                  <span>{order.paymentStatus === 'Paid' ? 'Total Paid' : 'Total Payable'}</span>
                  <span>₹{(order.totalAmount || 0).toLocaleString()}</span>
                </div>
              </div>
              {order.paymentStatus === 'Paid' && (
                <div className="payment-success-note">
                  <FiCheckCircle /> Payment Successful
                </div>
              )}
            </div>

            <div className="order-actions-footer">
              {order.status?.toLowerCase() === 'pending' && (
                <button className="btn-danger-outline full-width" onClick={() => setShowCancelModal(true)}>
                  Request Cancellation
                </button>
              )}
              {(order.status?.toLowerCase() === 'accepted' || order.status?.toLowerCase() === 'shipped') && (
                <button className="btn-primary full-width" onClick={() => alert('Tracking feature coming soon!')}>
                  Track Order
                </button>
              )}
            </div>

            <div className="order-card support-card-new">
              <h3 className="card-title">Need Help?</h3>
              <p className="support-subtitle">Get in touch with our team for any queries</p>
              <div className="support-grid">
                <a href={`https://wa.me/919087659045?text=Hi, I need help with my order #${order.id}`} target="_blank" rel="noreferrer" className="support-item whatsapp">
                  <FiMessageCircle /> WhatsApp
                </a>
                <a href="tel:+919087659045" className="support-item call">
                  <FiPhone /> Call Us
                </a>
                <a href="mailto:support@satvaorganics.com" className="support-item email">
                  <FiMail /> Email
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile View */}
      <div className="mobile-view mobile-order-details-container">
        <div className="mobile-details-header">
          <div className="mobile-header-center">
            <button
              onClick={() => navigate('/account/orders')}
              className="btn-back-details"
              aria-label="Back to Orders"
            >
              <BsChevronLeft />
            </button>
            <h3>ORDER DETAILS</h3>
          </div>
          <div className="mobile-header-actions">
            <button className="icon-btn-mobile" onClick={() => downloadInvoice(order)} title="Invoice">
              <FiDownload />
            </button>
            <button className="icon-btn-mobile" onClick={() => navigate('/shop')} title="Reorder">
              <FiPackage />
            </button>
            <button className="btn-help-mobile">HELP</button>
          </div>
        </div>

        <div className="mobile-scroll-content">
          {/* Main Info Card */}
          <div className="mobile-details-single-card">
            {/* Product Snippet */}
            {order.items?.map((item, idx) => (
              <div key={idx} className="inner-product-row">
                <div className="product-image-container">
                  <img src={item.image || (item.images && item.images[0])} alt={item.name} />
                </div>
                <div className="product-info-container">
                  <h4 className="p-name">{item.name}</h4>
                  <p className="p-variant">{item.selectedSize || '300g'}</p>
                  <p className="p-order-id">Order #{order.orderSerial || (order.id || '').toUpperCase()}</p>
                  <p className="p-price">₹{item.price * item.quantity}</p>
                </div>
              </div>
            ))}
            {order.status?.toLowerCase() === 'cancellation_requested' && (
              <div className="cancellation-notice-new warning">
                <FiClock /> <strong>Cancellation Requested</strong>
                <p>Your request is under review. Reason: {order.cancellationRequest?.reason}</p>
              </div>
            )}

            <div className="card-divider"></div>

            {/* Status Section */}
            <div className="inner-status-section">
              <div className="status-header-row">
                <div className="box-icon-wrapper">
                  <BsBoxSeam className="main-box-icon" />
                  <BsCheckCircleFill className="mini-check-badge" />
                </div>
                <div className="status-text-info">
                  <h4 className="status-main-title">
                    {order.status === 'Accepted' ? 'Order Placed' : order.status}
                  </h4>
                  <p className="delivery-subtitle">Delivery by {getEstimatedDelivery(order.createdAt)}</p>
                </div>
              </div>

              {/* Detailed Stepper */}
              <div className="detailed-stepper-wrapper">
                {/* Tooltip */}
                {(order.status === 'Accepted' || order.status === 'Pending') && (
                  <div className="shipping-soon-tooltip">
                    <span className="tooltip-dot"></span>
                    Shipping Soon!
                  </div>
                )}

                <div className="stepper-track-line">
                  <div className="track-fill" style={{
                    width: `${Math.min((getStatusSteps().findIndex(s => s.isActive) || 0) * 33.33 + (order.status?.toLowerCase() === 'delivered' ? 100 : 0), 100)}%`
                  }}></div>
                  {/* Moving Truck */}
                  {order.status !== 'Delivered' && order.status !== 'Cancelled' && (
                    <div className="moving-truck-icon" style={{
                      left: `${Math.min((getStatusSteps().findIndex(s => s.isActive) || 0) * 33.33 + 10, 90)}%`
                    }}>
                      <BsTruck />
                    </div>
                  )}
                </div>

                <div className="steps-points-row">
                  {getStatusSteps().map((step, i) => (
                    <div key={i} className={`step-item ${step.isCompleted ? 'done' : ''} ${step.isActive ? 'active' : ''}`}>
                      <div className="point-circle">
                        {step.isCompleted ? <BsCheckCircleFill /> : <div className="outer-circle"><div className="inner-dot"></div></div>}
                      </div>
                      <div className="step-label-group">
                        <span className="step-name">{step.label}</span>
                        <span className="step-date">{step.isCompleted ? formatDateOnly(step.timestamp || order.createdAt) : formatDateOnly(i === 3 ? getEstimatedDelivery(order.createdAt) : null)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {order.courierName === 'TPC' && (order.trackingNumber || order.consignment_no) && (
              <>
                <div className="card-divider"></div>
                <div className="inner-status-section">
                  <div className="status-header-row">
                    <div className="box-icon-wrapper">
                      <BsTruck className="main-box-icon" />
                    </div>
                    <div className="status-text-info">
                      <h4 className="status-main-title">Tracking Info (TPC)</h4>
                      <p className="delivery-subtitle">POD No: {order.trackingNumber || order.consignment_no}</p>
                    </div>
                  </div>
                  <div style={{ padding: '10px 0', fontSize: '14px' }}>
                    {trackingLoading ? (
                      <p><FiClock className="spinner" /> Fetching status...</p>
                    ) : trackingData ? (
                      <div>
                        <p><strong>Status:</strong> {trackingData.STATUS || trackingData.status || 'Processed'}</p>
                        {trackingData.LATEST_LOCATION && (
                          <p><strong>Location:</strong> {trackingData.LATEST_LOCATION}</p>
                        )}
                      </div>
                    ) : (
                      <p>Tracking info unavailable</p>
                    )}
                  </div>
                </div>
              </>
            )}
            <div className="card-divider"></div>

            {/* Cancellation Section */}
            <div className="inner-cancel-section-row">
              {['cancelled', 'delivered'].includes(order.status?.toLowerCase()) ? (
                <button
                  className="btn-primary-outline full-width"
                  onClick={() => navigate('/shop')}
                >
                  <FiPackage /> Reorder Items
                </button>
              ) : (
                <button
                  className="btn-cancel-purple full-width"
                  onClick={() => setShowCancelModal(true)}
                  disabled={['shipped', 'out for delivery', 'delivered', 'cancelled'].includes(order.status?.toLowerCase())}
                >
                  Cancel Order
                </button>
              )}
            </div>

            <div className="card-divider"></div>

            {/* Payment Info */}
            <div className="inner-payment-footer">
              <span className="payment-label">Your payment mode:</span>
              <span className="payment-value">
                {order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Paid Online'} <span className="dot-sep">•</span> ₹{order.totalAmount}
              </span>
            </div>
          </div>

          {/* Address Card */}
          <div className="mobile-address-section-card">
            <div className="address-header">
              <BsPinMapFill className="pin-icon" />
              <h4>Delivery Address</h4>
            </div>
            <div className="address-content">
              <p className="customer-name">{order.shippingAddress?.name || currentUser?.displayName}</p>
              <p className="address-line">
                {order.shippingAddress?.addressLine}, {order.shippingAddress?.landmark && order.shippingAddress.landmark + ','}
                {order.shippingAddress?.city}, {order.shippingAddress?.state}, {order.shippingAddress?.pincode}
              </p>
              <p className="customer-phone">{order.shippingAddress?.phone || order.phone}</p>
            </div>
          </div>

          {/* Recently Viewed Section */}
          <RecentlyViewedProducts />
        </div>

        <div className="mobile-footer-space" style={{ height: '50px' }}></div>
      </div>

      {showCancelModal && (
        <div className="modal-overlay-new" onClick={() => setShowCancelModal(false)}>
          <div className="modal-content-new mobile-bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle"></div>
            <div className="sheet-body">
              <h3 className="main-confirm-text">Are you sure you want to cancel?</h3>
              <p className="sub-confirm-text">Your order will be cancelled and the items will be returned to our stock.</p>
            </div>
            <div className="modal-body-new">
              <p>Please select a reason for cancellation:</p>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="reason-select"
              >
                <option value="">Select a reason</option>
                {cancelReasons.map((reason, idx) => (
                  <option key={idx} value={reason}>{reason}</option>
                ))}
              </select>
              <div className="modal-info-box">
                <FiInfo />
                <p>Your request will be reviewed by our admin team. You will be notified once it's approved.</p>
              </div>
            </div>
            <div className="modal-footer-new">
              <button className="btn-secondary" onClick={() => setShowCancelModal(false)}>Back</button>
              <button
                className="btn-danger"
                onClick={handleRequestCancellation}
                disabled={isCancelling || !cancelReason}
              >
                {isCancelling ? 'Cancelling...' : 'Yes, Cancel Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderDetails;
    