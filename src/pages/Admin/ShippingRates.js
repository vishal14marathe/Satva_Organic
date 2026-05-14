import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { FiSave, FiRefreshCcw, FiTruck, FiAlertCircle, FiCheckCircle, FiTrash } from 'react-icons/fi';
import defaultRates from '../../config/shippingRates.json';
import './ShippingRates.css';

const ShippingRates = () => {
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [rates, setRates] = useState(null);
  const [weightKeys, setWeightKeys] = useState([
    'up_to_500gm',
    '501gm_1kg',
    '1.1kg_2kg',
    '2.1kg_3kg',
    'above_3kg_per_kg',
    'for_10kg',
    'above_10kg_per_kg'
  ]);
  const [weightLabels, setWeightLabels] = useState({
    'up_to_500gm': 'Up to 500 GM',
    '501gm_1kg': '501 GM - 1 KG',
    '1.1kg_2kg': '1.1 KG - 2 KG',
    '2.1kg_3kg': '2.1 KG - 3 KG',
    'above_3kg_per_kg': 'Above 3 KG (Per Kg)',
    'for_10kg': 'FOR 10 KG',
    'above_10kg_per_kg': 'Above 10 KG (Per Kg)'
  });

  const [newZoneName, setNewZoneName] = useState('');
  const [newWeightKey, setNewWeightKey] = useState('');
  const [newWeightLabel, setNewWeightLabel] = useState('');

  useEffect(() => {
    fetchRates();
  }, []);

  const fetchRates = async () => {
    try {
      setLoading(true);
      const querySnapshot = await getDocs(collection(db, 'shipping_rates'));
      
      if (!querySnapshot.empty) {
        const docData = querySnapshot.docs.find(d => d.id === 'current')?.data();
        if (docData) {
          setRates(docData.zones);
          if (docData.weightKeys) setWeightKeys(docData.weightKeys);
          if (docData.weightLabels) setWeightLabels(docData.weightLabels);
        } else {
          setRates(querySnapshot.docs[0].data().zones);
        }
      } else {
        // If empty, use default from JSON and SEED the DB!
        setRates(defaultRates.zones);
        await setDoc(doc(db, 'shipping_rates', 'current'), {
          zones: defaultRates.zones,
          weightKeys: [
            'up_to_500gm',
            '501gm_1kg',
            '1.1kg_2kg',
            '2.1kg_3kg',
            'above_3kg_per_kg',
            'for_10kg',
            'above_10kg_per_kg'
          ],
          weightLabels: {
            'up_to_500gm': 'Up to 500 GM',
            '501gm_1kg': '501 GM - 1 KG',
            '1.1kg_2kg': '1.1 KG - 2 KG',
            '2.1kg_3kg': '2.1 KG - 3 KG',
            'above_3kg_per_kg': 'Above 3 KG (Per Kg)',
            'for_10kg': 'FOR 10 KG',
            'above_10kg_per_kg': 'Above 10 KG (Per Kg)'
          },
          updatedAt: serverTimestamp()
        });
        console.log('Seeded default shipping rates to DB.');
      }
    } catch (error) {
      console.error('Error fetching shipping rates:', error);
      setSaveStatus({ type: 'error', message: 'Failed to fetch rates from database.' });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (zoneKey, weightKey, value) => {
    setRates(prev => ({
      ...prev,
      [zoneKey]: {
        ...prev[zoneKey],
        [weightKey]: parseFloat(value) || 0
      }
    }));
  };

  const handleSave = async () => {
    setLoading(true);
    setSaveStatus(null);
    try {
      await setDoc(doc(db, 'shipping_rates', 'current'), {
        zones: rates,
        weightKeys,
        weightLabels,
        updatedAt: serverTimestamp()
      });
      setSaveStatus({ type: 'success', message: 'Shipping rates saved successfully!' });
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (error) {
      console.error('Error saving shipping rates:', error);
      setSaveStatus({ type: 'error', message: 'Failed to save rates. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleResetToDefault = () => {
    if (window.confirm('Are you sure you want to reset all rates to defaults? This will overwrite your current settings.')) {
      setRates(defaultRates.zones);
      setWeightKeys([
        'up_to_500gm',
        '501gm_1kg',
        '1.1kg_2kg',
        '2.1kg_3kg',
        'above_3kg_per_kg',
        'for_10kg',
        'above_10kg_per_kg'
      ]);
      setWeightLabels({
        'up_to_500gm': 'Up to 500 GM',
        '501gm_1kg': '501 GM - 1 KG',
        '1.1kg_2kg': '1.1 KG - 2 KG',
        '2.1kg_3kg': '2.1 KG - 3 KG',
        'above_3kg_per_kg': 'Above 3 KG (Per Kg)',
        'for_10kg': 'FOR 10 KG',
        'above_10kg_per_kg': 'Above 10 KG (Per Kg)'
      });
    }
  };

  const handleAddZone = () => {
    if (!newZoneName.trim()) return;
    const zoneKey = newZoneName.trim().toUpperCase().replace(/\s+/g, '_');
    
    if (rates[zoneKey]) {
      alert('Zone already exists!');
      return;
    }

    const defaultZoneRates = {};
    weightKeys.forEach(key => {
      defaultZoneRates[key] = 0;
    });

    setRates(prev => ({
      ...prev,
      [zoneKey]: defaultZoneRates
    }));
    setNewZoneName('');
  };

  const handleAddWeightSlab = () => {
    if (!newWeightKey.trim() || !newWeightLabel.trim()) return;
    const key = newWeightKey.trim().toLowerCase().replace(/\s+/g, '_');

    if (weightKeys.includes(key)) {
      alert('Weight key already exists!');
      return;
    }

    setWeightKeys(prev => [...prev, key]);
    setWeightLabels(prev => ({ ...prev, [key]: newWeightLabel.trim() }));
    
    setRates(prev => {
      const updatedRates = { ...prev };
      Object.keys(updatedRates).forEach(zone => {
        updatedRates[zone] = { ...updatedRates[zone], [key]: 0 };
      });
      return updatedRates;
    });

    setNewWeightKey('');
    setNewWeightLabel('');
  };

  const handleDeleteSlab = (key) => {
    if (window.confirm(`Are you sure you want to delete the weight slab "${weightLabels[key]}"?`)) {
      setWeightKeys(prev => prev.filter(k => k !== key));
      setWeightLabels(prev => {
        const updated = { ...prev };
        delete updated[key];
        return updated;
      });
      setRates(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(zone => {
          delete updated[zone][key];
        });
        return updated;
      });
    }
  };

  if (!rates) return <div className="loading-state">Loading rates...</div>;

  const zones = Object.keys(rates);

  return (
    <div className="shipping-rates-container">
      <div className="settings-header">
        <div className="header-content">
          <h1 className="settings-title">
            <FiTruck /> Shipping Rates Management
          </h1>
          <p className="settings-subtitle">Manage shipping charges based on weight and zones</p>
        </div>
        <div className="header-actions">
          <button className="btn-reset" onClick={handleResetToDefault} disabled={loading}>
            <FiRefreshCcw /> Reset to Default
          </button>
          <button className="btn-save" onClick={handleSave} disabled={loading}>
            <FiSave /> {loading ? 'Saving...' : 'Save Rates'}
          </button>
        </div>
      </div>

      {saveStatus && (
        <div className={`save-status ${saveStatus.type}`}>
          {saveStatus.type === 'success' ? <FiCheckCircle /> : <FiAlertCircle />}
          <span>{saveStatus.message}</span>
        </div>
      )}

      <div className="add-actions">
        <div className="add-section">
          <h3>Add New Zone</h3>
          <div className="input-group">
            <input 
              type="text" 
              placeholder="e.g. Zone G or State Name" 
              value={newZoneName}
              onChange={(e) => setNewZoneName(e.target.value)}
            />
            <button type="button" onClick={handleAddZone}>Add Zone</button>
          </div>
        </div>
        
        <div className="add-section">
          <h3>Add New Weight Slab</h3>
          <div className="input-group">
            <input 
              type="text" 
              placeholder="Key (e.g. above_20kg)" 
              value={newWeightKey}
              onChange={(e) => setNewWeightKey(e.target.value)}
            />
            <input 
              type="text" 
              placeholder="Label (e.g. Above 20 KG)" 
              value={newWeightLabel}
              onChange={(e) => setNewWeightLabel(e.target.value)}
            />
            <button type="button" onClick={handleAddWeightSlab}>Add Slab</button>
          </div>
        </div>
      </div>

      <div className="rates-table-wrapper">
        <table className="rates-table">
          <thead>
            <tr>
              <th>Weight (GM/KG)</th>
              {zones.map(zone => (
                <th key={zone}>{zone.replace(/_/g, ' ')}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weightKeys.map(weightKey => (
              <tr key={weightKey}>
                <td className="weight-label">
                  <div className="weight-label-wrapper">
                    <span>{weightLabels[weightKey]}</span>
                    <button 
                      type="button" 
                      className="btn-delete-slab" 
                      onClick={() => handleDeleteSlab(weightKey)}
                      title="Delete this slab"
                    >
                      <FiTrash />
                    </button>
                  </div>
                </td>
                {zones.map(zoneKey => (
                  <td key={`${zoneKey}-${weightKey}`}>
                    <div className="price-input-wrapper">
                      <span>₹</span>
                      <input
                        type="number"
                        value={rates[zoneKey][weightKey]}
                        onChange={(e) => handleInputChange(zoneKey, weightKey, e.target.value)}
                        min="0"
                      />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ShippingRates;
