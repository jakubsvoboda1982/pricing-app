from sqlalchemy.orm import Session
from app.models import Product, Price, Analytics
from uuid import UUID
import random

def calculate_hero_score(product_id: UUID, db: Session) -> int:
    """
    Calculate hero score for a product based on:
    - Number of price changes (higher = more active)
    - Price stability (lower volatility = higher score)
    - Category performance
    """
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        return 0

    prices = db.query(Price).filter(Price.product_id == product_id).all()

    if not prices:
        return 50  # Default score for new products

    # Price change frequency (0-30 points)
    price_changes = len(prices)
    change_score = min(price_changes * 2.5, 30)

    # Price stability (0-40 points)
    if len(prices) > 1:
        current_price = float(prices[-1].current_price) if prices[-1].current_price else 0
        old_price = float(prices[-1].old_price) if prices[-1].old_price else current_price

        if old_price > 0:
            price_variance = abs(current_price - old_price) / old_price
            stability_score = max(0, 40 - (price_variance * 100))
        else:
            stability_score = 40
    else:
        stability_score = 40

    # Category bonus (0-30 points)
    category_bonus = 15 if product.category else 0

    total_score = min(100, change_score + stability_score + category_bonus)
    return int(total_score)

def calculate_margin_risk(product_id: UUID, db: Session) -> str:
    """
    Calculate margin risk based on price trends:
    - Low: Stable prices, good margins
    - Medium: Some price changes
    - High: Frequent price drops
    """
    prices = db.query(Price).filter(Price.product_id == product_id).order_by(Price.changed_at).all()

    if not prices or len(prices) < 2:
        return "Low"

    # Calculate price trend
    recent_prices = prices[-5:] if len(prices) > 5 else prices

    price_drops = 0
    for i in range(1, len(recent_prices)):
        if recent_prices[i].current_price < recent_prices[i-1].current_price:
            price_drops += 1

    drop_ratio = price_drops / (len(recent_prices) - 1)

    if drop_ratio > 0.6:
        return "High"
    elif drop_ratio > 0.3:
        return "Medium"
    else:
        return "Low"

def update_product_analytics(product_id: UUID, db: Session) -> Analytics:
    """Update or create analytics for a product"""

    hero_score = calculate_hero_score(product_id, db)
    margin_risk = calculate_margin_risk(product_id, db)

    analytics = db.query(Analytics).filter(Analytics.product_id == product_id).first()

    if analytics:
        analytics.hero_score = hero_score
        analytics.margin_risk = margin_risk
        db.commit()
    else:
        # Get company_id from product
        product = db.query(Product).filter(Product.id == product_id).first()
        if product:
            analytics = Analytics(
                product_id=product_id,
                company_id=product.company_id,
                hero_score=hero_score,
                margin_risk=margin_risk,
            )
            db.add(analytics)
            db.commit()

    db.refresh(analytics)
    return analytics
