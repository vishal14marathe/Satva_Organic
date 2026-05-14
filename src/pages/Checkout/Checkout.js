import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { doc, updateDoc, arrayUnion, serverTimestamp, addDoc, collection, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import config from '../../config';
import { FiCheck, FiShield, FiEdit2, FiPlus, FiTruck, FiChevronLeft, FiCheckCircle, FiChevronDown, FiChevronUp, FiLock } from 'react-icons/fi';
import { BsShieldCheck, BsTruck, BsArrowRepeat } from 'react-icons/bs';
import './Checkout.css';
import defaultRates from '../../config/shippingRates.json';

const Checkout = () => {
  const { currentUser, login, signup } = useAuth();
  
  // Load Razorpay Script
  // Load Razorpay Script as a singleton
  const loadRazorpay = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.id = 'razorpay-checkout-js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };
  const { cartItems, cartTotal, gstTotal, updateQuantity, removeFromCart, calculateTotal, shippingConfig } = useCart();
  const navigate = useNavigate();

  const cleanImageUrl = (url) => {
    if (!url || typeof url !== 'string') return '';
    // Prevent Private Network Access errors for localhost/127.0.0.1
    if (url.includes('localhost') || url.includes('127.0.0.1')) return '';
    return url;
  };
  const [activeStep, setActiveStep] = useState(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState('');
  
  // Check if COD is available for all items in cart (Forced to true by user request)
  const isCodAvailable = true;

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('cod');
  const [isProcessing, setIsProcessing] = useState(false);
  const isInitiatingRef = React.useRef(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [showMobilePayment, setShowMobilePayment] = useState(false);
  const [showPriceBreakdown, setShowPriceBreakdown] = useState(false);
  const [showShippingDetails, setShowShippingDetails] = useState(false);

  const [address, setAddress] = useState({
    name: '',
    phone: '',
    pincode: '',
    locality: '',
    address: '',
    city: '',
    state: '',
    addressType: 'Home',
    alternatePhone: ''
  });

  // Calculate total weight in grams
  const calculateTotalWeight = (items) => {
    let totalWeightGrams = 0;
    (items || []).forEach(item => {
      const sizeStr = item.selectedSize || '';
      const quantity = item.quantity || 1;
      
      let weightInGrams = 0;
      if (sizeStr.toLowerCase().includes('kg')) {
        weightInGrams = parseFloat(sizeStr) * 1000;
      } else if (sizeStr.toLowerCase().includes('gm') || sizeStr.toLowerCase().includes('g')) {
        weightInGrams = parseFloat(sizeStr);
      }
      
      totalWeightGrams += weightInGrams * quantity;
    });
    return totalWeightGrams;
  };

  const totalWeight = calculateTotalWeight(cartItems);

  // Map state/city to zone
  const getZone = (state, city) => {
    const s = state || '';
    const c = city || '';
    
    if (c.toLowerCase().includes('kolhapur') || c.toLowerCase().includes('sangli')) return 'KOLHAPUR_SANGLI';
    if (c.toLowerCase().includes('hyderabad') || c.toLowerCase().includes('chennai')) return 'HYDERABAD_KERALA_CHENNAI_ZONE_C';
    
    if (s.toLowerCase().includes('maharashtra')) return 'MAHARASTRA_ZONE_A';
    if (s.toLowerCase().includes('karnataka')) return 'KARNATAKA_ZONE_B';
    if (s.toLowerCase().includes('kerala') || s.toLowerCase().includes('tamil nadu')) return 'HYDERABAD_KERALA_CHENNAI_ZONE_C';
    if (s.toLowerCase().includes('gujarat')) return 'GUJ_ZONE_D';
    if (s.toLowerCase().includes('delhi')) return 'DELHI_ZONE_E';
    if (s.toLowerCase().includes('madhya pradesh') || s.toLowerCase().includes('uttar pradesh') || s.toLowerCase().includes('haryana') || s.toLowerCase().includes('punjab') || s.toLowerCase().includes('rajasthan')) return 'MP_UP_CHAT_HAR_PUNG_RAJ_ZONE_F';
    
    return 'WB_ASSAM_ODISA_MANIPUR_JK_ANP_SPE_ZONE'; // Default fallback
  };

  const zone = getZone(address.state, address.city);
  
  // Calculate rate based on weight and zone
  const getShippingRate = (weightGrams, zoneKey) => {
    const zoneRates = defaultRates.zones[zoneKey];
    if (!zoneRates) return 50; // Fallback
    
    if (weightGrams <= 500) return zoneRates.up_to_500gm;
    if (weightGrams <= 1000) return zoneRates["501gm_1kg"];
    if (weightGrams <= 2000) return zoneRates["1.1kg_2kg"];
    if (weightGrams <= 3000) return zoneRates["2.1kg_3kg"];
    
    if (weightGrams <= 10000) {
      const baseRate = zoneRates["2.1kg_3kg"];
      const extraKg = Math.ceil((weightGrams - 3000) / 1000);
      return baseRate + (extraKg * zoneRates.above_3kg_per_kg);
    }
    
    const baseRateFor10 = zoneRates.for_10kg;
    const extraKgAbove10 = Math.ceil((weightGrams - 10000) / 1000);
    return baseRateFor10 + (extraKgAbove10 * zoneRates.above_10kg_per_kg);
  };

  const itemTotal = cartTotal || 0;
  const deliveryCharge = itemTotal === 0 ? 0 : getShippingRate(totalWeight, zone);
  
  const grossAmount = Math.round(itemTotal / 1.05);
  const gstAmount = itemTotal - grossAmount;
  const codCharge = selectedPaymentMethod === 'cod' ? 15 : 0;
  const grandTotal = itemTotal > 0 ? (itemTotal + deliveryCharge + codCharge) : 0;
  const roundedGst = 0; // GST already included in price

  // Safety check and image cleaning for cartTotal
  const safeCartTotal = grandTotal;
  const safeCartItems = (cartItems || []).map(item => ({
    ...item,
    image: cleanImageUrl(item.image),
    images: (item.images || []).map(img => {
      if (typeof img === 'string') return cleanImageUrl(img);
      return { ...img, url: cleanImageUrl(img.url) };
    })
  }));

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Update payment method if COD becomes unavailable
  useEffect(() => {
    if (!isCodAvailable && selectedPaymentMethod === 'cod') {
      setSelectedPaymentMethod('razorpay');
    }
  }, [isCodAvailable, selectedPaymentMethod]);
  


  const [localities, setLocalities] = useState([]);
  const [loadingPincode, setLoadingPincode] = useState(false);

  const handlePincodeChange = async (e) => {
    const newPincode = e.target.value.replace(/\D/g, ''); // Only allow numbers
    if (newPincode.length > 6) return;

    setAddress(prev => ({ ...prev, pincode: newPincode }));

    if (newPincode.length === 6) {
      setLoadingPincode(true);
      try {
        const response = await fetch(`https://api.postalpincode.in/pincode/${newPincode}`);
        const data = await response.json();
        
        if (data[0].Status === "Success") {
          const postOffices = data[0].PostOffice;
          const state = postOffices[0].State;
          const district = postOffices[0].District;
          
          // Get unique locality names
          const localityOptions = [...new Set(postOffices.map(po => po.Name))].sort();
          
          setAddress(prev => ({
            ...prev,
            state: state,
            city: district,
            locality: '' // Reset locality so user has to select
          }));
          setLocalities(localityOptions);
        } else {
           setLocalities([]);
        }
      } catch (error) {
        console.error("Error fetching pincode details:", error);
        setLocalities([]);
      } finally {
        setLoadingPincode(false);
      }
    } else {
      setLocalities([]);
    }
  };

  const [savedAddresses, setSavedAddresses] = useState([]);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);

  const fetchSavedAddresses = async () => {
    if (!currentUser) return;
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists() && userDoc.data().addresses) {
        setSavedAddresses(userDoc.data().addresses);
      }
    } catch (error) {
      console.error("Error fetching addresses:", error);
    }
  };

  useEffect(() => {
    if (currentUser) {
      setActiveStep(2);
      setEmail(currentUser.email);
      fetchSavedAddresses();
    } else {
      setActiveStep(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const handleLoginContinue = async (e) => {
    e.preventDefault();
    setError('');

    try {
      if (isSignup) {
        await signup(email, password, name);
      } else {
        await login(email, password);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to ' + (isSignup ? 'create account' : 'login') + '. Please check your credentials.');
    }
  };

  const handleAddressSubmit = async (e) => {
    e.preventDefault();

    try {
      const userRef = doc(db, 'users', currentUser.uid);
      let updatedAddresses = [...savedAddresses];

      if (editingIndex !== null) {
        // Update existing address
        updatedAddresses[editingIndex] = address;
        await updateDoc(userRef, { addresses: updatedAddresses });
      } else {
        // Add new address
        updatedAddresses.push(address);
        await updateDoc(userRef, { addresses: arrayUnion(address) });
      }

      setSavedAddresses(updatedAddresses);
      setIsAddingNew(false);
      setEditingIndex(null);
      setActiveStep(3);
    } catch (error) {
      console.error("Error saving address:", error);
      setActiveStep(3);
    }
  };

  const handleEditAddress = (index) => {
    setAddress(savedAddresses[index]);
    setEditingIndex(index);
    setIsAddingNew(true);
  };

  const handleSelectAddress = (selectedAddr) => {
    setAddress(selectedAddr);
    setActiveStep(3);
  };

  const handleSummaryContinue = () => {
    setActiveStep(4);
  };

  const StepHeader = ({ step, title, info }) => {
    const isActive = activeStep === step;
    const isCompleted = activeStep > step;

    return (
      <div className={`step-header ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
        <div className="step-number">
          {isCompleted ? <FiCheck /> : step}
        </div>
        <div className="step-title-wrapper">
          <span className="step-title">{title}</span>
          {isCompleted && info && <span className="step-info">{info}</span>}
        </div>
        {isCompleted && (
          <button
            className="step-action-btn"
            onClick={() => setActiveStep(step)}
          >
            CHANGE
          </button>
        )}
      </div>
    );
  };

  const [showConfirmation, setShowConfirmation] = useState(false);

  const sanitizeData = (data) => {
    return JSON.parse(JSON.stringify(data));
  };

  const handleConfirmOrder = async () => {
    if (isProcessing || isInitiatingRef.current) return;
    isInitiatingRef.current = true;
    setIsProcessing(true);

    const cleanImageUrl = (url) => {
      if (!url || typeof url !== 'string') return '';
      return (url.includes('localhost') || url.includes('127.0.0.1')) ? '' : url;
    };

    const sanitizedItems = cartItems.map(item => {
      const rawImage = item.image || (item.images && item.images[0] ? (item.images[0].url || item.images[0]) : '');
      return {
        id: item.id || '',
        name: item.name || '',
        price: item.price || 0,
        quantity: item.quantity || 1,
        selectedSize: item.selectedSize || 'Standard',
        image: cleanImageUrl(rawImage),
        category: item.category || 'General',
      };
    });

    const rawOrderData = {
      customerName: address.name || currentUser?.displayName || 'Guest',
      email: email || currentUser?.email || '',
      phoneNumber: address.phone || '',
      shippingAddress: {
        name: address.name || '',
        phone: address.phone || '',
        pincode: address.pincode || '',
        locality: address.locality || '',
        address: address.address || '',
        city: address.city || '',
        state: address.state || ''
      },
      items: sanitizedItems,
      totalAmount: grandTotal || 0,
      deliveryCharge: deliveryCharge || 0,
      codCharge: codCharge || 0,
      gstTotal: roundedGst > 0 ? roundedGst : 0,
      paymentMethod: selectedPaymentMethod,
      status: 'Pending',
      userId: currentUser?.uid || 'guest',
      orderCount: 1 
    };

    const orderData = sanitizeData(rawOrderData);

    if (selectedPaymentMethod === 'razorpay') {
      const res = await loadRazorpay();
      
      if (!res) {
        alert('Razorpay SDK failed to load. Are you online?');
        setIsProcessing(false);
        return;
      }

      try {
        const backendUrl = config.API_URL;
        
        const response = await fetch(backendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount: Math.round((grandTotal || 0) * 100)
          })
        });

        if (!response.ok) {
          let errorMessage = 'Failed to create order on backend';
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch (e) {
            errorMessage = `Server error: ${response.status} ${response.statusText}`;
          }
          throw new Error(errorMessage);
        }

        const razorpayOrder = await response.json();

        const options = {
          key: "rzp_test_SPs6AqG8E3r2Cp", 
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          name: "Satva Organics",
          description: "Grocery Purchase",
          image: "https://firebasestorage.googleapis.com/v0/b/satva-organics.firebasestorage.app/o/logo.png?alt=media&token=232ca39f-fb09-416b-ba77-6b5e01c5d058",
          order_id: razorpayOrder.id,
          handler: async function (response) {
            try {
              const snap = await getDocs(collection(db, 'orders'));
              const orderToSave = {
                ...orderData,
                orderSr: snap.size + 1,
                createdAt: serverTimestamp(),
                paymentId: response.razorpay_payment_id,
                paymentStatus: 'Paid',
                razorpayOrderId: response.razorpay_order_id || '',
                razorpaySignature: response.razorpay_signature || ''
              };
              
              await addDoc(collection(db, 'orders'), orderToSave);
              
              cartItems.forEach(item => {
                removeFromCart(item.id, item.selectedSize);
              });
              
              setShowConfirmation(true);
              setIsProcessing(false);
            } catch (error) {
              console.error("Error saving order (Razorpay):", error);
              alert(`Payment successful but failed to place order. Error: ${error.message}`);
              setIsProcessing(false);
            }
          },
          prefill: {
            name: address.name || currentUser?.displayName,
            email: email,
            contact: address.phone
          },
          theme: {
            color: "#27ae60"
          },
          modal: {
              ondismiss: function() {
                  setIsProcessing(false);
              }
          }
        };
        
        const paymentObject = new window.Razorpay(options);
        paymentObject.open();

      } catch (err) {
        console.error("Error creating order:", err);
        alert(`Failed to initiate payment. Technical Error: ${err.message}`);
        isInitiatingRef.current = false;
        setIsProcessing(false);
        return;
      }
      
    } else {
      // Cash on Delivery
      try {
        const snap = await getDocs(collection(db, 'orders'));
        await addDoc(collection(db, 'orders'), {
            ...orderData,
            orderSr: snap.size + 1,
            createdAt: serverTimestamp(),
            paymentStatus: 'Pending'
        });
        setShowConfirmation(true);
        setIsProcessing(false);
        isInitiatingRef.current = false;
      } catch (error) {
        console.error("Error saving order (COD):", error);
        alert("Failed to place order. Please try again.");
        setIsProcessing(false);
        isInitiatingRef.current = false;
      }
    }
  };

  return (
    <div className="checkout-page">
      {showConfirmation && (
        <div className="modal-overlay">
          <div className="modal-content confirmation-modal">
            <div className="celebration-icon">
              <FiCheck />
            </div>
            <h2>Order Confirmed!</h2>
            <p>Thank you for shopping with Satva Organics.</p>
            <p className="order-id-text">Your order has been placed successfully.</p>
            
            <div className="confirmation-help-section">
              <h3>Need help?</h3>
              <p>Damaged / Spoiled product reporting within 2 days</p>
              <p className="help-email">Email: <a href="mailto:info.satvaorganics@gmail.com">info.satvaorganics@gmail.com</a></p>
            </div>

            <button onClick={() => navigate('/shop')} className="continue-shopping-btn">
              CONTINUE SHOPPING
            </button>
          </div>
        </div>
      )}

      <div className="checkout-container">
        {/* Breadcrumb */}
        {isMobile && currentUser ? (
          <nav className="mobile-checkout-breadcrumb header-breadcrumb">
            <div className="breadcrumb-content">
              <button className="breadcrumb-back-btn" onClick={() => showMobilePayment ? setShowMobilePayment(false) : navigate(-1)} title="Go back">
                <FiChevronLeft />
              </button>
              <span 
                className={!showMobilePayment ? 'current' : 'clickable'} 
                onClick={() => setShowMobilePayment(false)}
              >
                ADDRESS & ITEMS
              </span>
              <span className="separator">›</span>
              <span className={showMobilePayment ? 'current' : ''}>PAYMENT</span>
            </div>
          </nav>
        ) : (
          <nav className="checkout-breadcrumb">
            <Link to="/">HOME</Link>
            <span className="separator">›</span>
            <Link to="/shop">SHOP</Link>
            <span className="separator">›</span>
            <span className="current">CHECKOUT</span>
          </nav>
        )}

        {/* Main Content Wrapper */}
        <div className="checkout-content-wrapper">
          {/* Main Content */}
          <div className="checkout-main">
          {isMobile && currentUser && (
            <div className="mobile-checkout-flow">
              {/* Address Section on Top for Mobile */}
              {!showMobilePayment ? (
                <>
                  {/* DELIVERY ADDRESS / Shipping details Collapsible */}
                  <div className="checkout-step mobile-address-step collapsible">
                    <div className="step-header clickable" onClick={() => setShowShippingDetails(!showShippingDetails)}>
                      <div className="step-number">1</div>
                      <div className="step-title-wrapper">
                        <span className="step-title">Shipping details</span>
                        {address.name && !isAddingNew && !showShippingDetails && (
                          <span className="step-info-summary">{address.name}, {address.pincode}</span>
                        )}
                      </div>
                      <div className="collapse-icon">
                        {showShippingDetails ? <FiChevronUp /> : <FiChevronDown />}
                      </div>
                    </div>
                    {showShippingDetails && (
                      <div className="step-body expanded">
                        {!address.name || isAddingNew ? (
                          <>
                            {!isAddingNew && savedAddresses.length > 0 ? (
                              <div className="saved-addresses-list">
                                {savedAddresses.map((addr, index) => {
                                  const isSelected = address && address.phone === addr.phone && address.address === addr.address;
                                  const isDefault = index === 0;
                                  
                                  return (
                                    <div 
                                      key={index} 
                                      className={`saved-address-card-v2 ${isSelected ? 'selected' : ''}`}
                                      onClick={() => handleSelectAddress(addr)}
                                    >
                                      <div className="address-card-header">
                                        <div className="address-card-title">
                                          <span className="address-name-v2">{addr.name}</span>
                                          {isDefault && <span className="default-tag">HOME (DEFAULT)</span>}
                                          {!isDefault && <span className="type-tag">{addr.locality}</span>}
                                        </div>
                                        <button 
                                          className="edit-address-icon-btn"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleEditAddress(index);
                                          }}
                                        >
                                          <FiEdit2 />
                                        </button>
                                        {isSelected && <FiCheckCircle className="selection-checkmark" />}
                                      </div>
                                      
                                      <p className="address-text-v2">
                                        {addr.address}, {addr.city} - {addr.pincode}
                                      </p>
                                      <p className="address-phone-v2">Phone: {addr.phone}</p>
                                      
                                      {isSelected && (
                                        <div className="selected-address-badge">
                                          DELIVERING TO THIS ADDRESS
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                                <button 
                                  className="add-new-address-btn"
                                  onClick={() => {
                                    setAddress({
                                      name: '', phone: '', pincode: '', locality: '',
                                      address: '', city: '', state: ''
                                    });
                                    setEditingIndex(null);
                                    setIsAddingNew(true);
                                  }}
                                >
                                  <FiPlus /> ADD A NEW ADDRESS
                                </button>
                              </div>
                            ) : (
                              <form className="address-form" onSubmit={handleAddressSubmit}>
                                <input 
                                  type="text" 
                                  className="checkout-input" 
                                  placeholder="Name" 
                                  required 
                                  value={address.name}
                                  onChange={e => setAddress({...address, name: e.target.value})}
                                />
                                <input 
                                  type="text" 
                                  className="checkout-input" 
                                  placeholder="10-digit mobile number" 
                                  required 
                                  value={address.phone}
                                  onChange={e => setAddress({...address, phone: e.target.value})}
                                />
                                <input 
                                  type="text" 
                                  className="checkout-input" 
                                  placeholder="Pincode" 
                                  required 
                                  value={address.pincode}
                                  onChange={handlePincodeChange}
                                  maxLength={6}
                                />
                                <textarea 
                                  className="checkout-input full-width" 
                                  placeholder="Address (Area and Street)" 
                                  rows="3" 
                                  required
                                  value={address.address}
                                  onChange={e => setAddress({...address, address: e.target.value})}
                                ></textarea>
                                <div className="form-actions">
                                  <button type="submit" className="continue-btn">
                                    SAVE AND DELIVER HERE
                                  </button>
                                  {savedAddresses.length > 0 && (
                                    <button type="button" className="cancel-btn" onClick={() => setIsAddingNew(false)}>
                                      CANCEL
                                    </button>
                                  )}
                                </div>
                              </form>
                            )}
                          </>
                        ) : (
                          <div className="selected-address-summary">
                            <p className="address-text">
                              <strong>{address.name}</strong><br/>
                              {address.address}, {address.city}, {address.state} - {address.pincode}
                            </p>
                            <p className="address-phone">{address.phone}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Product Details Section for Mobile - ALWAYS OPEN */}
                  <div className="checkout-step mobile-products-step">
                    <div className="step-header">
                      <div className="step-number">2</div>
                      <div className="step-title-wrapper">
                        <span className="step-title">Product details</span>
                      </div>
                    </div>
                    <div className="step-body">
                      {safeCartItems.map(item => {
                        const itemImage = item.images && item.images.length > 0
                          ? (item.images[0].url || item.images[0])
                          : item.image;
                        
                        const hasDiscount = item.originalPrice && item.originalPrice > item.price;

                        return (
                          <div key={`${item.id}-${item.selectedSize}`} className="mobile-product-card">
                            <img src={itemImage} alt={item.name} className="mobile-product-img" />
                            <div className="mobile-product-info">
                              <span className="mobile-product-category">{item.category}</span>
                              <h4 className="mobile-product-name">{item.name}</h4>
                              <div className="mobile-product-meta">
                                <span>Qty: {item.quantity}</span>
                                <span>Size: {item.selectedSize || 'Standard'}</span>
                              </div>
                              <div className="mobile-product-delivery">
                                <FiTruck /> Delivery by {new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                              </div>
                              <div className="mobile-product-price">
                                <span className="current-price">₹{item.price * item.quantity}</span>
                                {hasDiscount && (
                                  <span className="original-price">₹{item.originalPrice * item.quantity}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Bill Details Section for Mobile - Total Always Open, Breakdown Collapsible */}
                  <div className="checkout-step mobile-bill-details">
                    <div className="step-header clickable" onClick={() => setShowPriceBreakdown(!showPriceBreakdown)}>
                      <div className="step-title-wrapper">
                        <span className="step-title">Price details</span>
                      </div>
                      <div className="collapse-icon">
                        {showPriceBreakdown ? <FiChevronUp /> : <FiChevronDown />}
                      </div>
                    </div>
                    <div className="step-body">
                      {showPriceBreakdown && (
                        <div className="price-breakdown-expanded">
                          <div className="bill-row">
                            <span>Gross amount</span>
                            <span>₹{grossAmount.toLocaleString()}</span>
                          </div>
                          <div className="bill-row">
                            <span>GST (5%)</span>
                            <span>₹{gstAmount.toLocaleString()}</span>
                          </div>
                          <div className="bill-row">
                            <span>Delivery charge</span>
                            <span>{deliveryCharge === 0 ? <span className="green-text">FREE</span> : `₹${deliveryCharge}`}</span>
                          </div>
                          {selectedPaymentMethod === 'cod' && (
                            <div className="bill-row">
                              <span>COD Handling charge</span>
                              <span>₹15</span>
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div className="bill-row grand-total">
                        <span>Total payable</span>
                        <span>₹{grandTotal.toLocaleString()}</span>
                      </div>

                      {/* Savings Highlight */}
                      <div className="savings-highlight">
                         <span className="savings-icon">🎉</span>
                         <span className="savings-text">You saved ₹8 on shipping 🎉</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="mobile-payment-section">
                  <div className="checkout-step">
                    <div className="step-header active">
                      <span className="step-title">DELIVERY ADDRESS</span>
                    </div>
                    <div className="step-body">
                      <div className="selected-address-summary">
                        <p className="address-text">
                          <strong>{address.name}</strong><br/>
                          {address.address}, {address.city}, {address.state} - {address.pincode}
                        </p>
                        <p className="address-phone">{address.phone}</p>
                      </div>
                    </div>
                  </div>

                  <div className="checkout-step">
                    <div className="step-header active">
                      <span className="step-title">ORDER SUMMARY</span>
                    </div>
                    <div className="step-body">
                      {safeCartItems.map(item => {
                        const itemImage = item.images && item.images.length > 0
                          ? (item.images[0].url || item.images[0])
                          : item.image;
                        return (
                          <div key={`${item.id}-${item.selectedSize}`} className="mobile-product-card summary">
                            <img src={itemImage} alt={item.name} className="mobile-product-img" />
                            <div className="mobile-product-info">
                              <h4 className="mobile-product-name">{item.name}</h4>
                              <div className="mobile-product-meta">
                                <span>Qty: {item.quantity}</span>
                                <span>₹{item.price * item.quantity}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="checkout-step">
                    <div className="step-header active">
                      <span className="step-title">PRICE DETAILS</span>
                    </div>
                    <div className="step-body">
                      <div className="price-row">
                        <span>Gross Amount ({safeCartItems.length} items)</span>
                        <span>₹{grossAmount.toLocaleString()}</span>
                      </div>
                      <div className="price-row">
                        <span>GST (5%)</span>
                        <span>₹{gstAmount.toLocaleString()}</span>
                      </div>
                      <div className="price-row">
                        <span>Delivery Charges</span>
                        <span className={deliveryCharge === 0 ? "green-text" : ""}>{deliveryCharge === 0 ? "FREE" : `₹${deliveryCharge}`}</span>
                      </div>
                      {selectedPaymentMethod === 'cod' && (
                        <div className="price-row">
                          <span>COD Handling Charges</span>
                          <span>₹15</span>
                        </div>
                      )}
                      <div className="price-row total">
                        <span>Total Payable</span>
                        <span>₹{grandTotal.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="checkout-step">
                    <div className="step-header active">
                      <span className="step-title">PAYMENT METHOD</span>
                    </div>
                    <div className="step-body">
                      <div className="payment-options-container">
                        <div className={`payment-method-group ${selectedPaymentMethod === 'razorpay' ? 'active' : ''}`}>
                          <div className="payment-option" onClick={() => setSelectedPaymentMethod('razorpay')}>
                            <input type="radio" checked={selectedPaymentMethod === 'razorpay'} readOnly />
                            <span>UPI / Cards / NetBanking (Powered by Razorpay)</span>
                          </div>
                        </div>
                        {isCodAvailable && (
                          <div className={`payment-method-group ${selectedPaymentMethod === 'cod' ? 'active' : ''}`}>
                            <div className="payment-option" onClick={() => setSelectedPaymentMethod('cod')}>
                              <input type="radio" checked={selectedPaymentMethod === 'cod'} readOnly />
                              <div className="payment-option-labels">
                                <span>Cash on Delivery</span>
                                <span className="cod-charge-text">Handling charges ₹15</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Trust Badges */}
                      <div className="trust-badges-container">
                        <div className="trust-badge">
                          <BsShieldCheck />
                          <span>🔐 100% Secure Payments</span>
                        </div>
                        <div className="trust-badge">
                          <BsTruck />
                          <span>📦 Fresh & Hygienic Packaging</span>
                        </div>
                      </div>
                    </div>
                    <div className="checkout-disclaimer mobile-only-disclaimer">
                      By placing this order, you agree to our <Link to="/refund-policy">Refund & Return Policy</Link>
                    </div>
                  </div>
                </div>
              )}

              {/* Mobile Sticky Footers - Moved outside animated containers */}
              {!showMobilePayment ? (
                <div className="mobile-sticky-footer-v2">
                  <div className="mobile-total-info">
                    <span className="total-amount">₹{safeCartTotal.toLocaleString()}</span>
                    <span className="total-label">TOTAL</span>
                  </div>
                  <button 
                    className={`mobile-place-order-btn-v2 ${!address.name ? 'disabled' : ''}`}
                    onClick={() => {
                      if (!address.name) {
                        setShowShippingDetails(true);
                        alert('Please select or add a delivery address first');
                        return;
                      }
                      window.scrollTo(0, 0);
                      setShowMobilePayment(true);
                    }}
                  >
                    Continue <span style={{ fontSize: '20px', marginLeft: '4px' }}>›</span>
                  </button>
                </div>
              ) : (
                <div className="mobile-sticky-footer-v2 payment-footer">
                  <div className="mobile-total-info">
                    <span className="total-amount">₹{safeCartTotal.toLocaleString()}</span>
                    <span className="total-label">TOTAL</span>
                  </div>

                  <button 
                    className="mobile-place-order-btn-v2"
                    onClick={handleConfirmOrder}
                    disabled={isProcessing}
                  >
                    {isProcessing ? 'PROCESSING...' : 'Place Order'} <span style={{ fontSize: '20px', marginLeft: '4px' }}>›</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {!isMobile && (
            <>
          {/* Step 1: Login */}
          <div className="checkout-step">
            <StepHeader
              step={1}
              title="LOGIN OR SIGNUP"
              info={currentUser ? `Logged in as ${currentUser.displayName || currentUser.email}` : null}
            />
            {activeStep === 1 && !currentUser && (
              <div className="step-body">
                <div className="login-step-content">
                  <div className="login-form-container">
                    <form onSubmit={handleLoginContinue}>
                      <input
                        type="email"
                        className="checkout-input"
                        placeholder="Enter Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />

                      {isSignup && (
                        <input
                          type="text"
                          className="checkout-input"
                          placeholder="Enter Name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                        />
                      )}

                      <input
                        type="password"
                        className="checkout-input"
                        placeholder="Enter Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />

                      {error && <p style={{ color: 'red', fontSize: '12px', marginBottom: '8px' }}>{error}</p>}

                      <button type="submit" className="continue-btn">
                        {isSignup ? 'SIGNUP & CONTINUE' : 'LOGIN & CONTINUE'}
                      </button>

                      <div style={{ marginTop: '12px', fontSize: '14px', textAlign: 'center' }}>
                        <span style={{ color: '#878787' }}>
                          {isSignup ? 'Existing User? ' : 'New to Satva Organics? '}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setIsSignup(!isSignup);
                            setError('');
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#2874f0',
                            fontWeight: '600',
                            cursor: 'pointer'
                          }}
                        >
                          {isSignup ? 'Log in' : 'Sign up'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Delivery Address */}
          <div className="checkout-step">
            <StepHeader
              step={2}
              title="DELIVERY ADDRESS"
              info={activeStep > 2 ? `${address.name}, ${address.pincode}` : null}
            />
            {activeStep === 2 && (
              <div className="step-body">
                {!isAddingNew && savedAddresses.length > 0 ? (
                  <div className="saved-addresses-list">
                    {savedAddresses.map((addr, index) => (
                      <div key={index} className="saved-address-card">
                        <div className="address-header">
                          <span className="address-name">{addr.name}</span>
                          <span className="address-type">{addr.locality}</span>
                        </div>
                        <p className="address-text">
                          {addr.address}, {addr.city}, {addr.state} - {addr.pincode}
                        </p>
                        <p className="address-phone">Phone: {addr.phone}</p>
                        <div className="address-actions">
                          <button 
                            className="deliver-here-btn"
                            onClick={() => handleSelectAddress(addr)}
                          >
                            DELIVER HERE
                          </button>
                          <button 
                            className="edit-address-btn"
                            onClick={() => handleEditAddress(index)}
                          >
                            <FiEdit2 /> EDIT
                          </button>
                        </div>
                      </div>
                    ))}
                    <button 
                      className="add-new-address-btn"
                      onClick={() => {
                        setAddress({
                          name: '', phone: '', pincode: '', locality: '',
                          address: '', city: '', state: ''
                        });
                        setEditingIndex(null);
                        setIsAddingNew(true);
                      }}
                    >
                      <FiPlus /> ADD A NEW ADDRESS
                    </button>
                  </div>
                ) : (
                  <form className="address-form" onSubmit={handleAddressSubmit}>
                    <div className="delivery-message">
                      <FiCheck /> Delivery available in Kolhapur
                    </div>
                    <input 
                      type="text" 
                      className="checkout-input" 
                      placeholder="Name" 
                      required 
                      value={address.name}
                      onChange={e => setAddress({...address, name: e.target.value})}
                    />
                    <input 
                      type="text" 
                      className="checkout-input" 
                      placeholder="10-digit mobile number" 
                      required 
                      value={address.phone}
                      onChange={e => setAddress({...address, phone: e.target.value})}
                    />
                    <div style={{ position: 'relative' }}>
                      <input 
                        type="text" 
                        className="checkout-input" 
                        placeholder="Pincode" 
                        required 
                        value={address.pincode}
                        onChange={handlePincodeChange}
                        maxLength={6}
                      />
                      {loadingPincode && (
                        <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: '#666' }}>
                          Checking...
                        </div>
                      )}
                    </div>
                    
                    {localities.length > 0 ? (
                      <select
                        className="checkout-input"
                        value={address.locality}
                        onChange={e => setAddress({...address, locality: e.target.value})}
                        required
                        style={{ backgroundColor: 'white' }}
                      >
                        <option value="">Select Locality</option>
                        {localities.map((loc, index) => (
                          <option key={index} value={loc}>{loc}</option>
                        ))}
                      </select>
                    ) : (
                      <input 
                        type="text" 
                        className="checkout-input" 
                        placeholder="Locality" 
                        required 
                        value={address.locality}
                        onChange={e => setAddress({...address, locality: e.target.value})}
                      />
                    )}
                    <textarea 
                      className="checkout-input full-width" 
                      placeholder="Address (Area and Street)" 
                      rows="3" 
                      required
                      value={address.address}
                      onChange={e => setAddress({...address, address: e.target.value})}
                    ></textarea>
                    <input 
                      type="text" 
                      className="checkout-input" 
                      placeholder="City/District/Town" 
                      required 
                      value={address.city}
                      onChange={e => setAddress({...address, city: e.target.value})}
                    />
                    <input 
                      type="text" 
                      className="checkout-input" 
                      placeholder="State" 
                      required 
                      value={address.state}
                      onChange={e => setAddress({...address, state: e.target.value})}
                    />


                    <div className="form-row">
                      <input 
                        type="tel" 
                        className="checkout-input" 
                        placeholder="Alternate Phone (Optional)" 
                        value={address.alternatePhone || ''}
                        onChange={e => setAddress({...address, alternatePhone: e.target.value})}
                      />
                    </div>

                    <div className="address-type-section">
                      <label>Address Type</label>
                      <div className="address-type-options">
                        {['Home', 'Work', 'Other'].map(type => (
                          <label key={type} className={`type-option ${address.addressType === type ? 'selected' : ''}`}>
                            <input 
                              type="radio" 
                              name="addressType" 
                              value={type}
                              checked={address.addressType === type}
                              onChange={e => setAddress({...address, addressType: e.target.value})}
                            />
                            {type}
                          </label>
                        ))}
                      </div>
                    </div>
                    
                    <div className="form-actions">
                      <button type="submit" className="continue-btn" style={{width: 'auto', minWidth: '200px'}}>
                        {editingIndex !== null ? 'UPDATE ADDRESS' : 'SAVE AND DELIVER HERE'}
                      </button>
                      {savedAddresses.length > 0 && (
                        <button 
                          type="button" 
                          className="cancel-btn"
                          onClick={() => {
                            setIsAddingNew(false);
                            setEditingIndex(null);
                          }}
                        >
                          CANCEL
                        </button>
                      )}
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Step 3: Order Summary */}
          <div className="checkout-step">
            <StepHeader step={3} title="ORDER SUMMARY" info={`${safeCartItems.length} Items`} />
            {activeStep === 3 && (
              <div className="step-body">
                {safeCartItems.map(item => {
                  const itemImage = item.images && item.images.length > 0
                    ? (item.images[0].url || item.images[0])
                    : item.image;

                  return (
                    <div key={`${item.id}-${item.selectedSize || 'default'}`} className="order-summary-item">
                      <img src={itemImage} alt={item.name} className="summary-item-img" />
                      <div className="summary-item-details">
                        <h4>{item.name}</h4>
                        <div className="summary-item-meta">
                          Size: {item.selectedSize || 'Standard'}
                        </div>
                        <div className="summary-item-delivery">
                          <FiTruck /> Delivery by {new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </div>
                        <div className="summary-item-price">
                          ₹{item.price * item.quantity}
                        </div>
                      </div>
                      <div className="summary-item-actions">
                        <div className="quantity-controls small">
                          <button onClick={() => updateQuantity(item.id, item.selectedSize, item.quantity - 1)} disabled={item.quantity <= 1}>-</button>
                          <span>{item.quantity}</span>
                          <button 
                            onClick={() => {
                              const limit = item.maxStock || item.stock || 999;
                              if (item.quantity < limit) {
                                updateQuantity(item.id, item.selectedSize, item.quantity + 1);
                              } else {
                                alert(`Only ${limit} items available in stock.`);
                              }
                            }}
                            disabled={item.quantity >= (item.maxStock || item.stock || 999)}
                          >
                            +
                          </button>
                        </div>
                        <button className="remove-item-btn" onClick={() => removeFromCart(item.id, item.selectedSize)}>
                          REMOVE
                        </button>
                      </div>
                    </div>
                  );
                })}
                <button onClick={handleSummaryContinue} className="continue-btn">
                  CONTINUE
                </button>
              </div>
            )}
          </div>

          {/* Step 4: Payment Options */}
          <div className="checkout-step">
            <StepHeader step={4} title="PAYMENT OPTIONS" />
            {activeStep === 4 && (
              <div className="step-body">
                <div className="payment-options-container">
                  <div className={`payment-method-group ${selectedPaymentMethod === 'razorpay' ? 'active' : ''}`}>
                    <div 
                      className={`payment-option ${selectedPaymentMethod === 'razorpay' ? 'selected' : ''}`}
                      onClick={() => setSelectedPaymentMethod('razorpay')}
                    >
                      <div className="payment-label">
                        <input 
                          type="radio" 
                          name="payment" 
                          checked={selectedPaymentMethod === 'razorpay'}
                          onChange={() => setSelectedPaymentMethod('razorpay')}
                        />
                        <span>Razorpay (Cards, UPI, NetBanking)</span>
                      </div>
                    </div>
                    {selectedPaymentMethod === 'razorpay' && (
                      <div className="payment-action-container">
                        <div className="checkout-disclaimer desktop">
                          By placing this order, you agree to our <Link to="/refund-policy">Refund & Return Policy</Link>
                        </div>
                        <button 
                          className="pay-now-btn" 
                          onClick={handleConfirmOrder}
                          disabled={isProcessing}
                        >
                          {isProcessing ? 'PROCESSING...' : `PAY ₹${safeCartTotal.toLocaleString()}`}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className={`payment-method-group ${selectedPaymentMethod === 'cod' ? 'active' : ''}`}>
                    <div 
                      className={`payment-option ${selectedPaymentMethod === 'cod' ? 'selected' : ''} ${!isCodAvailable ? 'disabled' : ''}`}
                      onClick={() => isCodAvailable && setSelectedPaymentMethod('cod')}
                    >
                      <div className="payment-label">
                        <input 
                          type="radio" 
                          name="payment" 
                          checked={selectedPaymentMethod === 'cod'}
                          onChange={() => isCodAvailable && setSelectedPaymentMethod('cod')}
                          disabled={!isCodAvailable}
                        />
                        <div className="payment-option-labels">
                          <span>Cash on Delivery</span>
                          <span className="cod-charge-text">Handling charges ₹15 apply</span>
                        </div>
                        {!isCodAvailable && (
                          <span className="cod-unavailable-badge">Not Available</span>
                        )}
                      </div>
                    </div>
                    {selectedPaymentMethod === 'cod' && (
                      <div className="payment-action-container">
                        <div className="checkout-disclaimer desktop">
                          By placing this order, you agree to our <Link to="/refund-policy">Refund & Return Policy</Link>
                        </div>
                        <button 
                          className="pay-now-btn" 
                          onClick={handleConfirmOrder}
                          disabled={isProcessing}
                        >
                          {isProcessing ? 'PROCESSING...' : `PAY ₹${safeCartTotal.toLocaleString()}`}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          </>
          )}
        </div>

        {/* Sidebar - Price Details */}
        {!isMobile && (
        <div className="checkout-sidebar">
          <div className="price-details-card">
            <div className="price-header">PRICE DETAILS</div>
            <div className="price-content">
              <div className="products-breakdown">
                <div className="breakdown-header">
                  Price ({safeCartItems.length} item{safeCartItems.length !== 1 ? 's' : ''})
                </div>
                {safeCartItems.map((item, index) => {
                  const itemImage = item.images && item.images.length > 0
                    ? (item.images[0].url || item.images[0])
                    : item.image;

                  return (
                    <div key={`price-${item.id}-${item.selectedSize || 'default'}-${index}`} className="product-price-item">
                      <div className="product-price-left">
                        <img src={itemImage} alt={item.name} className="product-price-thumb" />
                        <div className="product-price-info">
                          <div className="product-price-name">{item.name}</div>
                          <div className="product-price-meta">
                            {item.selectedSize && <span>{item.selectedSize}</span>}
                            <span>Qty: {item.quantity}</span>
                          </div>
                        </div>
                      </div>
                      <div className="product-price-amount">
                        ₹{(item.price * item.quantity).toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="price-divider"></div>

              <div className="price-row">
                <span>Gross Amount</span>
                <span>₹{grossAmount.toLocaleString()}</span>
              </div>

              <div className="price-row">
                <span>GST (5%)</span>
                <span>₹{gstAmount.toLocaleString()}</span>
              </div>

              <div className="price-row">
                <span>Delivery Charges</span>
                <span className={deliveryCharge === 0 ? "green-text" : ""}>{deliveryCharge === 0 ? "FREE" : `₹${deliveryCharge}`}</span>
              </div>

              {selectedPaymentMethod === 'cod' && (
                <div className="price-row">
                  <span>COD Handling Charges</span>
                  <span>₹15</span>
                </div>
              )}

              <div className="price-divider"></div>

              <div className="price-row total">
                <span>Total Payable</span>
                <span>₹{safeCartTotal.toLocaleString()}</span>
              </div>
              <div className="savings-text">
                Your Total Savings on this order ₹0
              </div>
            </div>
          </div>

          <div className="secure-badge">
            <FiShield className="secure-icon" />
            <div>
              Safe and Secure Payments. Easy returns.<br />
              100% Authentic products.
            </div>
          </div>
          
          <div className="checkout-footer-links">
            <a href="/policy/return">Return & Refund Policy</a>
            <span>•</span>
            <a href="/support">Need Help?</a>
          </div>
        </div>
        )}
      </div>
    </div>
  </div>
);
};

export default Checkout;
