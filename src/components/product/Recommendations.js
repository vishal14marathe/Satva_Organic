import React, { useState, useEffect } from 'react';
import { collection, query, where, limit, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../config/firebase';
import ProductCard from './ProductCard';
import './Recommendations.css';
import { FiStar, FiTrendingUp, FiPercent, FiClock } from 'react-icons/fi';

const Recommendations = ({ 
  title = "You may also like", 
  category, 
  currentProductId,
  type = 'category', // 'category', 'popular', 'discounted', 'recentlyViewed'
  limit: limitCount = 5
}) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecommendations = async () => {
      try {
        setLoading(true);
        const productsRef = collection(db, 'products');
        let q;

        switch (type) {
          case 'popular':
            q = query(
              productsRef,
              orderBy('rating', 'desc'),
              limit(limitCount + 1)
            );
            break;
          case 'discounted':
            q = query(
              productsRef,
              where('discount', '>', 0),
              limit(limitCount + 1)
            );
            break;
          case 'recentlyViewed':
            const recentlyViewedIds = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
            if (recentlyViewedIds.length > 0) {
              // Firestore 'in' query is limited to 10 IDs
              const idsToFetch = recentlyViewedIds.filter(id => id !== currentProductId).slice(0, 10);
              if (idsToFetch.length > 0) {
                q = query(
                  productsRef,
                  where('__name__', 'in', idsToFetch),
                  limit(limitCount)
                );
              } else {
                // Fallback to popular if no other recently viewed
                q = query(productsRef, orderBy('rating', 'desc'), limit(limitCount));
              }
            } else {
              q = query(productsRef, limit(limitCount));
            }
            break;
          case 'category':
          default:
            if (category) {
              q = query(
                productsRef, 
                where('category', '==', category),
                limit(limitCount + 1)
              );
            } else {
              q = query(productsRef, limit(limitCount + 1));
            }
            break;
        }

        const querySnapshot = await getDocs(q);
        let recommendedProducts = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Filter out current product if provided
        if (currentProductId) {
          recommendedProducts = recommendedProducts.filter(p => p.id !== currentProductId);
        }

        setProducts(recommendedProducts.slice(0, limitCount));
      } catch (error) {
        console.error('Error fetching recommendations:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecommendations();
  }, [category, currentProductId, type, limitCount]);

  if (loading || products.length === 0) return null;

  const getIcon = () => {
    switch (type) {
      case 'popular': return <FiTrendingUp className="recommendations-icon" />;
      case 'discounted': return <FiPercent className="recommendations-icon" />;
      case 'recentlyViewed': return <FiClock className="recommendations-icon" />;
      default: return <FiStar className="recommendations-icon" />;
    }
  };

  return (
    <section className="recommendations-section">
      <div className="recommendations-header">
        {getIcon()}
        <h2>{title}</h2>
      </div>
      <div className="recommendations-grid">
        {products.map(product => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
};

export default Recommendations;
