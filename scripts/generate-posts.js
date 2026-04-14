#!/usr/bin/env node
/**
 * generate-posts.js
 * 카테고리 + 주제 목록으로 Hugo 포맷 .md 파일 관리
 * LLM 호출 없음 — 토픽 선택과 파일 저장만 담당. 본문 생성은 서브 에이전트가 직접 수행.
 *
 * Usage:
 *   # 사용 가능한 토픽 목록 (JSON)
 *   node scripts/generate-posts.js --pick-topics --category "tech-ai" --count 5
 *
 *   # 본문을 stdin으로 받아 파일 저장
 *   echo "본문..." | node scripts/generate-posts.js --write-post --slug "my-post" \
 *     --title "My Post Title" --category-name "Tech & AI" --tags '["tech","ai"]'
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.resolve(__dirname, '../../config/.env');
const POSTS_DIR = path.join(ROOT, 'content', 'posts');
const DATA_DIR = path.join(ROOT, 'data');
const CATEGORIES_PATH = path.join(DATA_DIR, 'categories.json');

// ─── Load env ───
function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv(ENV_PATH);

// ─── Category definitions with topic templates ───
const CATEGORY_TOPICS = {
  'tech-ai': {
    name: 'Tech & AI',
    tags: ['technology', 'artificial intelligence', 'machine learning', 'tech trends'],
    topics: [
      { title: 'Best AI Writing Tools in 2026: Complete Comparison', slug: 'best-ai-writing-tools-2026' },
      { title: 'How to Use ChatGPT for Small Business Marketing', slug: 'chatgpt-small-business-marketing' },
      { title: 'Top 10 AI Image Generators You Should Try Today', slug: 'top-ai-image-generators-2026' },
      { title: 'AI vs Human Writers: Which Produces Better Content?', slug: 'ai-vs-human-writers-comparison' },
      { title: 'Best Budget Gaming Laptops Under $800 in 2026', slug: 'best-budget-gaming-laptops-2026' },
      { title: 'How Machine Learning Is Changing Healthcare Forever', slug: 'machine-learning-changing-healthcare' },
      { title: 'Best Coding AI Assistants for Developers in 2026', slug: 'best-coding-ai-assistants-2026' },
      { title: 'What Is Retrieval-Augmented Generation (RAG) Explained Simply', slug: 'what-is-rag-explained-simply' },
      { title: 'Top AI Tools for Students to Boost Productivity', slug: 'ai-tools-students-productivity' },
      { title: 'How to Build Your First AI Chatbot: Beginner Guide', slug: 'build-first-ai-chatbot-beginner' },
      { title: 'Best AI Video Editing Software in 2026', slug: 'best-ai-video-editing-software-2026' },
      { title: 'Edge Computing vs Cloud Computing: What You Need to Know', slug: 'edge-vs-cloud-computing-guide' },
      { title: 'How AI Is Revolutionizing Customer Service in 2026', slug: 'ai-revolutionizing-customer-service' },
      { title: 'Top 10 Open Source AI Models Worth Exploring', slug: 'top-open-source-ai-models' },
      { title: 'Best Smart Home Devices for Energy Savings', slug: 'smart-home-devices-energy-savings' },
      { title: 'AI in Education: How Schools Are Adopting Technology', slug: 'ai-education-schools-adopting-tech' },
      { title: 'Best VPN Services for Privacy in 2026', slug: 'best-vpn-services-privacy-2026' },
      { title: 'How to Protect Your Data from AI Scraping', slug: 'protect-data-from-ai-scraping' },
      { title: 'Top Emerging Programming Languages to Learn in 2026', slug: 'emerging-programming-languages-2026' },
      { title: 'How Quantum Computing Will Impact Everyday Technology', slug: 'quantum-computing-impact-everyday-tech' },
    ],
  },
  'health-fitness': {
    name: 'Health & Fitness',
    tags: ['health', 'fitness', 'wellness', 'exercise', 'nutrition'],
    topics: [
      { title: 'Best Home Workout Routines for Beginners in 2026', slug: 'best-home-workout-routines-beginners' },
      { title: 'How to Start Intermittent Fasting: Complete Guide', slug: 'intermittent-fasting-complete-guide' },
      { title: 'Top 10 Protein-Rich Foods for Muscle Building', slug: 'protein-rich-foods-muscle-building' },
      { title: 'Walking 10,000 Steps a Day: Does It Actually Work?', slug: 'walking-10000-steps-does-it-work' },
      { title: 'Best Fitness Trackers Under $100 in 2026', slug: 'best-fitness-trackers-under-100' },
      { title: 'How to Fix Your Sleep Schedule in One Week', slug: 'fix-sleep-schedule-one-week' },
      { title: 'Best Yoga Poses for Back Pain Relief', slug: 'yoga-poses-back-pain-relief' },
      { title: 'Creatine for Beginners: Benefits, Dosage, and Safety', slug: 'creatine-beginners-benefits-dosage' },
      { title: 'How to Meal Prep for Weight Loss: Weekly Plan', slug: 'meal-prep-weight-loss-weekly-plan' },
      { title: 'Best Running Shoes for Flat Feet in 2026', slug: 'best-running-shoes-flat-feet-2026' },
      { title: 'Cold Plunge Benefits: What Science Actually Says', slug: 'cold-plunge-benefits-science' },
      { title: 'How to Build a Home Gym on a Budget', slug: 'build-home-gym-budget' },
      { title: 'Best Supplements for Joint Health After 40', slug: 'supplements-joint-health-after-40' },
      { title: 'HIIT vs Steady-State Cardio: Which Burns More Fat?', slug: 'hiit-vs-steady-state-cardio-fat' },
      { title: 'How to Stay Hydrated: Signs You\'re Not Drinking Enough', slug: 'stay-hydrated-signs-dehydration' },
      { title: 'Best Stretching Routines for Office Workers', slug: 'stretching-routines-office-workers' },
      { title: 'How Gut Health Affects Your Mood and Energy', slug: 'gut-health-mood-energy' },
      { title: 'Top 10 Anti-Inflammatory Foods to Eat Daily', slug: 'anti-inflammatory-foods-daily' },
      { title: 'Best Meditation Apps for Stress Relief in 2026', slug: 'meditation-apps-stress-relief-2026' },
      { title: 'How to Prevent Burnout: Science-Backed Strategies', slug: 'prevent-burnout-science-strategies' },
    ],
  },
  'recipes-cooking': {
    name: 'Recipes & Cooking',
    tags: ['recipes', 'cooking', 'food', 'meal ideas', 'kitchen tips'],
    topics: [
      { title: 'Best 30-Minute Dinner Recipes for Busy Weeknights', slug: '30-minute-dinner-recipes-busy' },
      { title: 'How to Make Perfect Sourdough Bread at Home', slug: 'perfect-sourdough-bread-home' },
      { title: 'Top 10 Air Fryer Recipes for Beginners', slug: 'air-fryer-recipes-beginners' },
      { title: 'Easy Meal Prep Ideas That Last All Week', slug: 'easy-meal-prep-ideas-all-week' },
      { title: 'Best One-Pot Pasta Recipes for Lazy Cooks', slug: 'one-pot-pasta-recipes-lazy' },
      { title: 'How to Make Restaurant-Quality Steak at Home', slug: 'restaurant-quality-steak-home' },
      { title: 'Top Budget-Friendly Meals Under $5 Per Serving', slug: 'budget-meals-under-5-dollars' },
      { title: 'Best Slow Cooker Recipes for Winter Comfort', slug: 'slow-cooker-recipes-winter' },
      { title: 'How to Make Homemade Pizza Dough: Easy Recipe', slug: 'homemade-pizza-dough-easy' },
      { title: 'Top 10 Smoothie Recipes for Weight Loss', slug: 'smoothie-recipes-weight-loss' },
      { title: 'Best Vegetarian Recipes Even Meat Lovers Enjoy', slug: 'vegetarian-recipes-meat-lovers' },
      { title: 'How to Season a Cast Iron Skillet Properly', slug: 'season-cast-iron-skillet' },
      { title: 'Best Breakfast Ideas That Take Under 10 Minutes', slug: 'breakfast-ideas-under-10-minutes' },
      { title: 'How to Make Perfect Fried Rice Every Time', slug: 'perfect-fried-rice-recipe' },
      { title: 'Top 10 Healthy Snack Ideas for Work', slug: 'healthy-snack-ideas-work' },
      { title: 'Best Instant Pot Recipes for Beginners', slug: 'instant-pot-recipes-beginners' },
      { title: 'How to Bake Chocolate Chip Cookies Like a Pro', slug: 'bake-chocolate-chip-cookies-pro' },
      { title: 'Easy Chicken Marinade Recipes for Grilling Season', slug: 'chicken-marinade-recipes-grilling' },
      { title: 'Best Homemade Sauce Recipes Everyone Should Know', slug: 'homemade-sauce-recipes-essential' },
      { title: 'How to Stock a Pantry for Emergency Cooking', slug: 'stock-pantry-emergency-cooking' },
    ],
  },
  'travel-places': {
    name: 'Travel & Places',
    tags: ['travel', 'destinations', 'vacation', 'travel tips', 'tourism'],
    topics: [
      { title: 'Best Budget Travel Destinations in 2026', slug: 'budget-travel-destinations-2026' },
      { title: 'How to Travel Solo Safely: Complete Guide', slug: 'solo-travel-safely-guide' },
      { title: 'Top 10 Hidden Gems in Europe for 2026', slug: 'hidden-gems-europe-2026' },
      { title: 'Best Travel Credit Cards for Points and Miles', slug: 'travel-credit-cards-points-miles' },
      { title: 'How to Pack Light for a Two-Week Trip', slug: 'pack-light-two-week-trip' },
      { title: 'Best Digital Nomad Cities to Live and Work', slug: 'digital-nomad-cities-live-work' },
      { title: 'How to Find Cheap Flights: Insider Tips', slug: 'find-cheap-flights-insider-tips' },
      { title: 'Top 10 National Parks in the US Worth Visiting', slug: 'national-parks-us-worth-visiting' },
      { title: 'Best Travel Insurance Policies for International Trips', slug: 'travel-insurance-international-trips' },
      { title: 'How to Handle Jet Lag: Science-Based Recovery Tips', slug: 'handle-jet-lag-recovery-tips' },
      { title: 'Best Road Trip Routes Across America', slug: 'road-trip-routes-america' },
      { title: 'Top All-Inclusive Resorts for Families in 2026', slug: 'all-inclusive-resorts-families-2026' },
      { title: 'How to Travel with Kids Without Losing Your Mind', slug: 'travel-with-kids-tips' },
      { title: 'Best Southeast Asia Backpacking Routes', slug: 'southeast-asia-backpacking-routes' },
      { title: 'How to Stay Safe While Traveling Abroad', slug: 'stay-safe-traveling-abroad' },
      { title: 'Best Airbnb Alternatives for Budget Travelers', slug: 'airbnb-alternatives-budget' },
      { title: 'Top Cruise Destinations for First-Time Cruisers', slug: 'cruise-destinations-first-time' },
      { title: 'How to Plan a Trip on a Tight Budget', slug: 'plan-trip-tight-budget' },
      { title: 'Best Photography Spots Around the World', slug: 'photography-spots-around-world' },
      { title: 'Japan Travel Guide: Tips for First-Time Visitors', slug: 'japan-travel-guide-first-time' },
    ],
  },
  'personal-finance': {
    name: 'Personal Finance',
    tags: ['personal finance', 'investing', 'budgeting', 'money management', 'savings'],
    topics: [
      { title: 'How to Start Investing with Just $100', slug: 'start-investing-100-dollars' },
      { title: 'Best High-Yield Savings Accounts in 2026', slug: 'high-yield-savings-accounts-2026' },
      { title: 'How to Create a Budget That Actually Works', slug: 'create-budget-that-works' },
      { title: 'Best Side Hustles to Make Extra Money in 2026', slug: 'side-hustles-extra-money-2026' },
      { title: 'How to Pay Off Student Loans Faster', slug: 'pay-off-student-loans-faster' },
      { title: 'Index Funds vs ETFs: Which Should You Choose?', slug: 'index-funds-vs-etfs-choose' },
      { title: 'How to Build an Emergency Fund from Scratch', slug: 'build-emergency-fund-scratch' },
      { title: 'Best Budgeting Apps to Track Your Spending', slug: 'budgeting-apps-track-spending' },
      { title: 'How to Improve Your Credit Score in 30 Days', slug: 'improve-credit-score-30-days' },
      { title: 'Roth IRA vs Traditional IRA: Full Comparison', slug: 'roth-ira-vs-traditional-ira' },
      { title: 'How to Save Money on Groceries Without Coupons', slug: 'save-money-groceries-no-coupons' },
      { title: 'Best Cashback Credit Cards for Everyday Spending', slug: 'cashback-credit-cards-everyday' },
      { title: 'How to Negotiate a Higher Salary at Your Job', slug: 'negotiate-higher-salary-job' },
      { title: 'Financial Independence Retire Early (FIRE): Beginner Guide', slug: 'fire-movement-beginner-guide' },
      { title: 'How to Teach Kids About Money Management', slug: 'teach-kids-money-management' },
      { title: 'Best Robo-Advisors for Hands-Off Investing', slug: 'robo-advisors-hands-off-investing' },
      { title: 'How to Reduce Monthly Bills by 30%', slug: 'reduce-monthly-bills-30-percent' },
      { title: 'Cryptocurrency for Beginners: What to Know in 2026', slug: 'cryptocurrency-beginners-2026' },
      { title: 'How to Start a Small Business on a Shoestring Budget', slug: 'start-small-business-shoestring' },
      { title: 'Tax Deductions You\'re Probably Missing', slug: 'tax-deductions-probably-missing' },
    ],
  },
  'gaming': {
    name: 'Gaming',
    tags: ['gaming', 'video games', 'PC gaming', 'console gaming', 'game reviews'],
    topics: [
      { title: 'Best Free-to-Play Games Worth Your Time in 2026', slug: 'best-free-to-play-games-2026' },
      { title: 'How to Build a Gaming PC Under $1000', slug: 'build-gaming-pc-under-1000' },
      { title: 'Top 10 Indie Games You Shouldn\'t Miss in 2026', slug: 'top-indie-games-2026' },
      { title: 'Best Gaming Monitors for Competitive Play', slug: 'gaming-monitors-competitive-play' },
      { title: 'How to Improve Your Aim in FPS Games', slug: 'improve-aim-fps-games' },
      { title: 'Best Couch Co-Op Games for Couples', slug: 'couch-coop-games-couples' },
      { title: 'Nintendo Switch vs Steam Deck: Which to Buy?', slug: 'switch-vs-steam-deck-2026' },
      { title: 'How to Start Game Streaming on Twitch', slug: 'start-game-streaming-twitch' },
      { title: 'Best RPGs with Over 100 Hours of Content', slug: 'best-rpgs-100-hours-content' },
      { title: 'Top Gaming Headsets Under $100 in 2026', slug: 'gaming-headsets-under-100' },
      { title: 'Best Strategy Games for Beginners', slug: 'strategy-games-beginners' },
      { title: 'How to Fix High Ping and Lag in Online Games', slug: 'fix-high-ping-lag-online' },
      { title: 'Best Open World Games to Explore in 2026', slug: 'open-world-games-explore-2026' },
      { title: 'Top Mobile Games That Don\'t Require Internet', slug: 'mobile-games-no-internet' },
      { title: 'How to Set Up a Game Room on a Budget', slug: 'game-room-setup-budget' },
      { title: 'Best Horror Games That Will Actually Scare You', slug: 'horror-games-actually-scary' },
      { title: 'Gaming Chairs vs Office Chairs: Worth the Hype?', slug: 'gaming-chairs-vs-office-chairs' },
      { title: 'Best PS5 Exclusive Games in 2026', slug: 'ps5-exclusive-games-2026' },
      { title: 'How to Get Better at Fighting Games', slug: 'get-better-fighting-games' },
      { title: 'Best Games to Play When You\'re Bored', slug: 'games-to-play-when-bored' },
    ],
  },
  'movies-tv': {
    name: 'Movies & TV',
    tags: ['movies', 'TV shows', 'streaming', 'entertainment', 'reviews'],
    topics: [
      { title: 'Best Netflix Shows to Binge-Watch in 2026', slug: 'best-netflix-shows-binge-2026' },
      { title: 'Top 10 Movies Coming to Theaters This Spring', slug: 'movies-coming-theaters-spring-2026' },
      { title: 'Best Horror Movies on Streaming Right Now', slug: 'horror-movies-streaming-now' },
      { title: 'How to Get the Most Out of Your Streaming Subscriptions', slug: 'maximize-streaming-subscriptions' },
      { title: 'Best Anime Series for Beginners to Start With', slug: 'anime-series-beginners-start' },
      { title: 'Top Underrated Movies Most People Missed', slug: 'underrated-movies-people-missed' },
      { title: 'Best True Crime Documentaries on Netflix', slug: 'true-crime-documentaries-netflix' },
      { title: 'Disney+ vs HBO Max vs Netflix: Which Is Best?', slug: 'disney-hbo-netflix-comparison' },
      { title: 'Best Feel-Good Movies for a Rainy Day', slug: 'feel-good-movies-rainy-day' },
      { title: 'Top K-Drama Series to Watch in 2026', slug: 'k-drama-series-watch-2026' },
      { title: 'Best Sci-Fi Movies of All Time Ranked', slug: 'best-sci-fi-movies-all-time' },
      { title: 'How to Host the Perfect Movie Night at Home', slug: 'host-perfect-movie-night-home' },
      { title: 'Best Comedy TV Shows Currently Airing', slug: 'comedy-tv-shows-currently-airing' },
      { title: 'Top Thriller Movies That Keep You Guessing', slug: 'thriller-movies-keep-guessing' },
      { title: 'Best Movies Based on True Stories', slug: 'movies-based-true-stories' },
      { title: 'How to Build a Home Theater on a Budget', slug: 'home-theater-budget-setup' },
      { title: 'Best Animated Movies for Adults', slug: 'animated-movies-for-adults' },
      { title: 'Top TV Shows Canceled Too Soon', slug: 'tv-shows-canceled-too-soon' },
      { title: 'Best Foreign Language Films You Need to See', slug: 'foreign-language-films-must-see' },
      { title: 'Streaming Services Comparison: Complete Price Guide 2026', slug: 'streaming-services-price-guide-2026' },
    ],
  },
  'diy-life-hacks': {
    name: 'DIY & Life Hacks',
    tags: ['DIY', 'life hacks', 'home improvement', 'tips and tricks', 'productivity'],
    topics: [
      { title: 'Best Organization Hacks for Small Apartments', slug: 'organization-hacks-small-apartments' },
      { title: 'How to Fix Common Household Problems Yourself', slug: 'fix-common-household-problems' },
      { title: 'Top 10 Cleaning Hacks That Save Time and Money', slug: 'cleaning-hacks-save-time-money' },
      { title: 'Best DIY Home Decor Ideas on a Budget', slug: 'diy-home-decor-budget' },
      { title: 'How to Organize Your Closet Like a Pro', slug: 'organize-closet-like-pro' },
      { title: 'Best Productivity Hacks for Working from Home', slug: 'productivity-hacks-work-home' },
      { title: 'How to Remove Any Stain: Ultimate Guide', slug: 'remove-any-stain-guide' },
      { title: 'Top Kitchen Organization Ideas for More Space', slug: 'kitchen-organization-ideas-space' },
      { title: 'How to Paint a Room Like a Professional', slug: 'paint-room-like-professional' },
      { title: 'Best Phone Hacks You Probably Didn\'t Know', slug: 'phone-hacks-you-didnt-know' },
      { title: 'How to Unclog a Drain Without Calling a Plumber', slug: 'unclog-drain-without-plumber' },
      { title: 'Best Life Hacks for Saving Money Every Day', slug: 'life-hacks-saving-money-daily' },
      { title: 'How to Build Simple Furniture Without Power Tools', slug: 'build-furniture-no-power-tools' },
      { title: 'Top Laundry Tips That Make Clothes Last Longer', slug: 'laundry-tips-clothes-last-longer' },
      { title: 'How to Create a Capsule Wardrobe from Scratch', slug: 'capsule-wardrobe-from-scratch' },
      { title: 'Best Garage Organization Ideas for More Space', slug: 'garage-organization-ideas-space' },
      { title: 'How to Fix a Running Toilet in 5 Minutes', slug: 'fix-running-toilet-5-minutes' },
      { title: 'Best Morning Routine Hacks for Productive Days', slug: 'morning-routine-hacks-productive' },
      { title: 'How to Deep Clean Your House Room by Room', slug: 'deep-clean-house-room-by-room' },
      { title: 'Top Travel Packing Hacks for Light Packers', slug: 'travel-packing-hacks-light' },
    ],
  },
  'pets-animals': {
    name: 'Pets & Animals',
    tags: ['pets', 'dogs', 'cats', 'animal care', 'pet health'],
    topics: [
      { title: 'Best Dog Breeds for First-Time Owners', slug: 'dog-breeds-first-time-owners' },
      { title: 'How to Train a Puppy: Complete Beginner Guide', slug: 'train-puppy-beginner-guide' },
      { title: 'Best Cat Food Brands Recommended by Vets in 2026', slug: 'best-cat-food-brands-vets-2026' },
      { title: 'How to Stop a Dog from Barking Excessively', slug: 'stop-dog-barking-excessively' },
      { title: 'Best Indoor Plants That Are Safe for Cats', slug: 'indoor-plants-safe-cats' },
      { title: 'How to Introduce a New Pet to Your Home', slug: 'introduce-new-pet-home' },
      { title: 'Best Low-Maintenance Pets for Busy People', slug: 'low-maintenance-pets-busy-people' },
      { title: 'How to Know If Your Dog Is Sick: Warning Signs', slug: 'dog-sick-warning-signs' },
      { title: 'Best Dog Toys for Aggressive Chewers', slug: 'dog-toys-aggressive-chewers' },
      { title: 'How to Cat-Proof Your Apartment', slug: 'cat-proof-apartment-guide' },
      { title: 'Best Pet Insurance Providers in 2026', slug: 'pet-insurance-providers-2026' },
      { title: 'How to Clean Dog Ears at Home Safely', slug: 'clean-dog-ears-home-safely' },
      { title: 'Best Fish Tanks for Beginners', slug: 'fish-tanks-beginners-guide' },
      { title: 'How to Deal with Pet Separation Anxiety', slug: 'pet-separation-anxiety-tips' },
      { title: 'Best Flea and Tick Prevention for Dogs', slug: 'flea-tick-prevention-dogs' },
      { title: 'How to Travel with Pets: Airplane and Car Tips', slug: 'travel-with-pets-airplane-car' },
      { title: 'Best Automatic Pet Feeders for Cats and Dogs', slug: 'automatic-pet-feeders-cats-dogs' },
      { title: 'How to Groom Your Dog at Home', slug: 'groom-dog-at-home-guide' },
      { title: 'Best Litter Boxes for Multiple Cats', slug: 'litter-boxes-multiple-cats' },
      { title: 'How to Help an Overweight Pet Lose Weight', slug: 'overweight-pet-lose-weight' },
    ],
  },
  'cars-auto': {
    name: 'Cars & Auto',
    tags: ['cars', 'automotive', 'electric vehicles', 'car maintenance', 'auto reviews'],
    topics: [
      { title: 'Best Electric Cars Under $40,000 in 2026', slug: 'electric-cars-under-40000-2026' },
      { title: 'How to Change Your Own Oil: Step-by-Step Guide', slug: 'change-oil-step-by-step' },
      { title: 'Best Used Cars Under $15,000 That Last Forever', slug: 'used-cars-under-15000-last' },
      { title: 'Electric vs Hybrid vs Gas: Which Should You Buy?', slug: 'electric-hybrid-gas-comparison' },
      { title: 'How to Improve Your Car\'s Fuel Efficiency', slug: 'improve-car-fuel-efficiency' },
      { title: 'Best Dash Cams for Every Budget in 2026', slug: 'dash-cams-every-budget-2026' },
      { title: 'How to Negotiate the Best Price at a Car Dealership', slug: 'negotiate-price-car-dealership' },
      { title: 'Best Car Insurance Companies for Young Drivers', slug: 'car-insurance-young-drivers' },
      { title: 'How to Jump Start a Dead Battery', slug: 'jump-start-dead-battery-guide' },
      { title: 'Best SUVs for Families in 2026', slug: 'best-suvs-families-2026' },
      { title: 'How to Detail Your Car Like a Professional', slug: 'detail-car-like-professional' },
      { title: 'Best Tires for All-Season Driving', slug: 'tires-all-season-driving' },
      { title: 'How to Read Your Check Engine Light Codes', slug: 'read-check-engine-light-codes' },
      { title: 'Best Car Accessories You Actually Need', slug: 'car-accessories-actually-need' },
      { title: 'How to Wash Your Car Without Scratching the Paint', slug: 'wash-car-without-scratching' },
      { title: 'Best First Cars for New Drivers in 2026', slug: 'first-cars-new-drivers-2026' },
      { title: 'How to Check and Replace Your Brake Pads', slug: 'check-replace-brake-pads' },
      { title: 'Best Pickup Trucks for Work and Play', slug: 'pickup-trucks-work-play-2026' },
      { title: 'How Long Do Electric Car Batteries Really Last?', slug: 'electric-car-batteries-how-long' },
      { title: 'Best Car Cleaning Products for Interior and Exterior', slug: 'car-cleaning-products-guide' },
    ],
  },
  'real-estate': {
    name: 'Real Estate',
    tags: ['real estate', 'home buying', 'property', 'housing market', 'mortgage'],
    topics: [
      { title: 'How to Buy Your First Home: Complete Step-by-Step Guide', slug: 'buy-first-home-step-by-step' },
      { title: 'Best Cities for First-Time Home Buyers in 2026', slug: 'cities-first-time-buyers-2026' },
      { title: 'Renting vs Buying a Home: Which Makes More Sense?', slug: 'renting-vs-buying-home-sense' },
      { title: 'How to Negotiate a Lower House Price', slug: 'negotiate-lower-house-price' },
      { title: 'Best Home Improvements That Increase Property Value', slug: 'home-improvements-increase-value' },
      { title: 'How to Get Pre-Approved for a Mortgage', slug: 'get-pre-approved-mortgage' },
      { title: 'Best Real Estate Investment Strategies for Beginners', slug: 'real-estate-investment-beginners' },
      { title: 'How to Sell Your Home Fast in a Slow Market', slug: 'sell-home-fast-slow-market' },
      { title: 'What Credit Score Do You Need to Buy a House?', slug: 'credit-score-buy-house-needed' },
      { title: 'Best Neighborhoods for Young Professionals in 2026', slug: 'neighborhoods-young-professionals-2026' },
      { title: 'How to Save for a Down Payment Faster', slug: 'save-down-payment-faster' },
      { title: 'Fixed vs Variable Mortgage Rates Explained', slug: 'fixed-vs-variable-mortgage-rates' },
      { title: 'How to Spot Red Flags During a Home Inspection', slug: 'red-flags-home-inspection' },
      { title: 'Best Real Estate Apps for House Hunting', slug: 'real-estate-apps-house-hunting' },
      { title: 'How to Become a Real Estate Agent: Career Guide', slug: 'become-real-estate-agent-guide' },
      { title: 'Best Areas for Rental Property Investment', slug: 'areas-rental-property-investment' },
      { title: 'How to Refinance Your Mortgage and Save Money', slug: 'refinance-mortgage-save-money' },
      { title: 'First-Time Buyer Programs and Grants in 2026', slug: 'first-time-buyer-programs-2026' },
      { title: 'How to Stage Your Home for a Quick Sale', slug: 'stage-home-quick-sale' },
      { title: 'Property Tax Guide: What Homeowners Need to Know', slug: 'property-tax-guide-homeowners' },
    ],
  },
  'celebrity-entertainment': {
    name: 'Celebrity & Entertainment News',
    tags: ['celebrities', 'entertainment', 'pop culture', 'celebrity news', 'Hollywood'],
    topics: [
      { title: 'Biggest Celebrity Couples of 2026 So Far', slug: 'biggest-celebrity-couples-2026' },
      { title: 'Most Anticipated Celebrity Comebacks This Year', slug: 'celebrity-comebacks-2026' },
      { title: 'Top Celebrity Fashion Moments of 2026', slug: 'celebrity-fashion-moments-2026' },
      { title: 'Celebrities Who Started Successful Side Businesses', slug: 'celebrities-successful-businesses' },
      { title: 'Biggest Award Show Moments in Recent History', slug: 'biggest-award-show-moments' },
      { title: 'Celebrity Workout Routines You Can Actually Follow', slug: 'celebrity-workout-routines-follow' },
      { title: 'Most Followed Celebrities on Social Media in 2026', slug: 'most-followed-celebrities-social-2026' },
      { title: 'Celebrity Homes: Most Expensive Houses Sold This Year', slug: 'celebrity-homes-expensive-2026' },
      { title: 'Famous Celebrity Feuds That Made Headlines', slug: 'celebrity-feuds-headlines' },
      { title: 'Celebrities Who Are Surprisingly Frugal', slug: 'celebrities-surprisingly-frugal' },
      { title: 'Top Celebrity Book Recommendations of 2026', slug: 'celebrity-book-recommendations-2026' },
      { title: 'Celebrity Kids Following in Their Parents\' Footsteps', slug: 'celebrity-kids-parents-footsteps' },
      { title: 'Most Inspirational Celebrity Transformations', slug: 'inspirational-celebrity-transformations' },
      { title: 'Celebrities Who Changed Careers Completely', slug: 'celebrities-changed-careers' },
      { title: 'Biggest Celebrity Scandals That Shocked Everyone', slug: 'celebrity-scandals-shocked' },
      { title: 'Celebrity Chefs and Their Signature Recipes', slug: 'celebrity-chefs-signature-recipes' },
      { title: 'Famous Actors Who Do Their Own Stunts', slug: 'actors-own-stunts' },
      { title: 'Celebrity Charity Work Making a Real Difference', slug: 'celebrity-charity-work-difference' },
      { title: 'Richest Celebrities Under 30 in 2026', slug: 'richest-celebrities-under-30-2026' },
      { title: 'Celebrity Skincare Routines That Actually Work', slug: 'celebrity-skincare-routines-work' },
    ],
  },
  'sports': {
    name: 'Sports',
    tags: ['sports', 'athletics', 'fitness', 'sports news', 'game analysis'],
    topics: [
      { title: 'Best Fantasy Football Strategies for 2026 Season', slug: 'fantasy-football-strategies-2026' },
      { title: 'How to Get Into Running as a Complete Beginner', slug: 'get-into-running-beginner' },
      { title: 'Top 10 Greatest Athletes of All Time Ranked', slug: 'greatest-athletes-all-time' },
      { title: 'Best Sports Documentaries to Watch Right Now', slug: 'sports-documentaries-watch-now' },
      { title: 'How to Improve Your Basketball Skills at Home', slug: 'improve-basketball-skills-home' },
      { title: 'Best Golf Clubs for Beginners in 2026', slug: 'golf-clubs-beginners-2026' },
      { title: 'How to Start Playing Tennis: Beginner Guide', slug: 'start-playing-tennis-beginner' },
      { title: 'Best Sports Betting Tips for Responsible Gambling', slug: 'sports-betting-tips-responsible' },
      { title: 'How to Train for Your First 5K Race', slug: 'train-first-5k-race' },
      { title: 'Best Workout Recovery Tips for Athletes', slug: 'workout-recovery-tips-athletes' },
      { title: 'How to Watch Live Sports Without Cable', slug: 'watch-live-sports-no-cable' },
      { title: 'Best Martial Arts Styles for Self-Defense', slug: 'martial-arts-self-defense' },
      { title: 'How to Get Better at Swimming', slug: 'get-better-swimming-tips' },
      { title: 'Best Sports Video Games in 2026', slug: 'sports-video-games-2026' },
      { title: 'How to Prevent Sports Injuries: Expert Tips', slug: 'prevent-sports-injuries-tips' },
      { title: 'Best Cycling Routes for Beginners', slug: 'cycling-routes-beginners' },
      { title: 'How to Choose the Right Running Shoes', slug: 'choose-right-running-shoes' },
      { title: 'Best Pre-Workout Meals for Peak Performance', slug: 'pre-workout-meals-performance' },
      { title: 'How to Build Endurance for Any Sport', slug: 'build-endurance-any-sport' },
      { title: 'Top Youth Sports Programs Worth Joining', slug: 'youth-sports-programs-joining' },
    ],
  },
  'fashion-style': {
    name: 'Fashion & Style',
    tags: ['fashion', 'style', 'clothing', 'trends', 'outfit ideas'],
    topics: [
      { title: 'Best Fashion Trends for Spring/Summer 2026', slug: 'fashion-trends-spring-summer-2026' },
      { title: 'How to Build a Minimalist Wardrobe on a Budget', slug: 'minimalist-wardrobe-budget' },
      { title: 'Top Affordable Fashion Brands for Men in 2026', slug: 'affordable-fashion-brands-men-2026' },
      { title: 'Best Online Thrift Stores for Sustainable Fashion', slug: 'online-thrift-stores-sustainable' },
      { title: 'How to Dress for a Job Interview: Complete Guide', slug: 'dress-job-interview-guide' },
      { title: 'Best Sneaker Brands for Everyday Wear', slug: 'sneaker-brands-everyday-wear' },
      { title: 'How to Find Your Personal Style', slug: 'find-personal-style-guide' },
      { title: 'Best Watches Under $200 for Every Style', slug: 'watches-under-200-every-style' },
      { title: 'Top Fashion Apps for Finding Outfit Inspiration', slug: 'fashion-apps-outfit-inspiration' },
      { title: 'How to Take Care of Leather Products', slug: 'care-leather-products-guide' },
      { title: 'Best Sunglasses Brands for UV Protection and Style', slug: 'sunglasses-brands-uv-style' },
      { title: 'How to Match Colors in Your Outfits Like a Pro', slug: 'match-colors-outfits-pro' },
      { title: 'Best Workwear for Women: Professional and Stylish', slug: 'workwear-women-professional-stylish' },
      { title: 'How to Shop Smart During Sales Season', slug: 'shop-smart-sales-season' },
      { title: 'Best Subscription Clothing Boxes in 2026', slug: 'subscription-clothing-boxes-2026' },
      { title: 'How to Break In New Shoes Without Pain', slug: 'break-in-new-shoes-no-pain' },
      { title: 'Best Ethical Fashion Brands to Support', slug: 'ethical-fashion-brands-support' },
      { title: 'How to Style Oversized Clothing Fashionably', slug: 'style-oversized-clothing-fashion' },
      { title: 'Best Accessories to Elevate Any Outfit', slug: 'accessories-elevate-any-outfit' },
      { title: 'How to Organize Your Wardrobe Seasonally', slug: 'organize-wardrobe-seasonally' },
    ],
  },
  'parenting-family': {
    name: 'Parenting & Family',
    tags: ['parenting', 'family', 'kids', 'child development', 'family life'],
    topics: [
      { title: 'Best Educational Toys for Toddlers in 2026', slug: 'educational-toys-toddlers-2026' },
      { title: 'How to Handle Toddler Tantrums: Expert Tips', slug: 'handle-toddler-tantrums-tips' },
      { title: 'Best Family Board Games for Game Night', slug: 'family-board-games-game-night' },
      { title: 'How to Get Your Kids to Eat Healthy Foods', slug: 'kids-eat-healthy-foods-tips' },
      { title: 'Best Baby Monitors for Peace of Mind in 2026', slug: 'baby-monitors-peace-mind-2026' },
      { title: 'How to Set Screen Time Limits for Children', slug: 'screen-time-limits-children' },
      { title: 'Best Activities for Kids on Rainy Days', slug: 'activities-kids-rainy-days' },
      { title: 'How to Talk to Teenagers About Mental Health', slug: 'talk-teenagers-mental-health' },
      { title: 'Best College Savings Plans for Parents', slug: 'college-savings-plans-parents' },
      { title: 'How to Balance Work and Family Life', slug: 'balance-work-family-life' },
      { title: 'Best Apps for Helping Kids Learn to Read', slug: 'apps-kids-learn-read' },
      { title: 'How to Prepare Your Child for Their First Day of School', slug: 'prepare-child-first-school-day' },
      { title: 'Best Family Vacation Spots on a Budget', slug: 'family-vacation-spots-budget' },
      { title: 'How to Teach Kids Responsibility at Every Age', slug: 'teach-kids-responsibility-age' },
      { title: 'Best Strollers for Every Budget in 2026', slug: 'strollers-every-budget-2026' },
      { title: 'How to Deal with Sibling Rivalry', slug: 'deal-sibling-rivalry-tips' },
      { title: 'Best Car Seats for Safety and Comfort', slug: 'car-seats-safety-comfort' },
      { title: 'How to Create a Bedtime Routine That Works', slug: 'bedtime-routine-that-works' },
      { title: 'Best Ways to Make Family Dinners Fun', slug: 'make-family-dinners-fun' },
      { title: 'How to Support Your Child Through Bullying', slug: 'support-child-through-bullying' },
    ],
  },
  'home-garden': {
    name: 'Home & Garden',
    tags: ['home', 'garden', 'landscaping', 'interior design', 'home improvement'],
    topics: [
      { title: 'Best Indoor Plants for Low Light Rooms', slug: 'indoor-plants-low-light-rooms' },
      { title: 'How to Start a Vegetable Garden from Scratch', slug: 'start-vegetable-garden-scratch' },
      { title: 'Best Robot Vacuums for Pet Hair in 2026', slug: 'robot-vacuums-pet-hair-2026' },
      { title: 'How to Create a Cozy Living Room on a Budget', slug: 'cozy-living-room-budget' },
      { title: 'Best Lawn Care Tips for a Green Yard', slug: 'lawn-care-tips-green-yard' },
      { title: 'How to Choose Paint Colors for Every Room', slug: 'choose-paint-colors-every-room' },
      { title: 'Best Outdoor Furniture for Small Patios', slug: 'outdoor-furniture-small-patios' },
      { title: 'How to Get Rid of Common Garden Pests Naturally', slug: 'get-rid-garden-pests-naturally' },
      { title: 'Best Air Purifiers for Allergies in 2026', slug: 'air-purifiers-allergies-2026' },
      { title: 'How to Build Raised Garden Beds: DIY Guide', slug: 'build-raised-garden-beds-diy' },
      { title: 'Best Kitchen Remodel Ideas for Every Budget', slug: 'kitchen-remodel-ideas-budget' },
      { title: 'How to Grow Herbs Indoors Year-Round', slug: 'grow-herbs-indoors-year-round' },
      { title: 'Best Smart Sprinkler Systems for Your Lawn', slug: 'smart-sprinkler-systems-lawn' },
      { title: 'How to Childproof Your Home Room by Room', slug: 'childproof-home-room-by-room' },
      { title: 'Best Bathroom Renovation Ideas on a Budget', slug: 'bathroom-renovation-ideas-budget' },
      { title: 'How to Compost at Home: Beginner Guide', slug: 'compost-at-home-beginner-guide' },
      { title: 'Best Mattresses for Back Pain Relief in 2026', slug: 'mattresses-back-pain-relief-2026' },
      { title: 'How to Design a Small Backyard for Entertaining', slug: 'design-small-backyard-entertaining' },
      { title: 'Best Home Security Systems Without Monthly Fees', slug: 'home-security-no-monthly-fees' },
      { title: 'How to Winterize Your Home Before Cold Weather', slug: 'winterize-home-cold-weather' },
    ],
  },
  'music': {
    name: 'Music',
    tags: ['music', 'songs', 'albums', 'artists', 'music streaming'],
    topics: [
      { title: 'Best Wireless Earbuds for Music Lovers in 2026', slug: 'wireless-earbuds-music-lovers-2026' },
      { title: 'How to Learn Guitar as a Complete Beginner', slug: 'learn-guitar-complete-beginner' },
      { title: 'Best Music Streaming Services Compared', slug: 'music-streaming-services-compared' },
      { title: 'Top Albums You Need to Listen to in 2026', slug: 'top-albums-listen-2026' },
      { title: 'How to Build a Vinyl Record Collection', slug: 'build-vinyl-record-collection' },
      { title: 'Best Bluetooth Speakers Under $100', slug: 'bluetooth-speakers-under-100' },
      { title: 'How to Make Music at Home with Free Software', slug: 'make-music-home-free-software' },
      { title: 'Best Songs for Every Mood: Ultimate Playlist Guide', slug: 'songs-every-mood-playlist' },
      { title: 'How to Discover New Music You\'ll Actually Love', slug: 'discover-new-music-actually-love' },
      { title: 'Best Music Festivals to Attend in 2026', slug: 'music-festivals-attend-2026' },
      { title: 'How to Improve Your Singing Voice at Home', slug: 'improve-singing-voice-home' },
      { title: 'Best Turntables for Beginners on a Budget', slug: 'turntables-beginners-budget' },
      { title: 'How to Create the Perfect Study Playlist', slug: 'create-perfect-study-playlist' },
      { title: 'Best Headphones for Audiophiles in 2026', slug: 'headphones-audiophiles-2026' },
      { title: 'How to Learn Piano Online for Free', slug: 'learn-piano-online-free' },
      { title: 'Best Concert Venues in America', slug: 'concert-venues-america' },
      { title: 'How to Support Independent Musicians', slug: 'support-independent-musicians' },
      { title: 'Best Music Production Software for Beginners', slug: 'music-production-software-beginners' },
      { title: 'Top One-Hit Wonders That Still Slap', slug: 'one-hit-wonders-still-slap' },
      { title: 'How to Read Sheet Music: Beginner Guide', slug: 'read-sheet-music-beginner' },
    ],
  },
  'education-study': {
    name: 'Education & Study Tips',
    tags: ['education', 'study tips', 'learning', 'online courses', 'academic success'],
    topics: [
      { title: 'Best Free Online Courses to Take in 2026', slug: 'free-online-courses-2026' },
      { title: 'How to Study Effectively: Science-Based Techniques', slug: 'study-effectively-science-techniques' },
      { title: 'Best Note-Taking Methods for Students', slug: 'note-taking-methods-students' },
      { title: 'How to Learn a New Language Fast', slug: 'learn-new-language-fast' },
      { title: 'Best Study Apps That Actually Help You Focus', slug: 'study-apps-help-focus' },
      { title: 'How to Write a College Essay That Stands Out', slug: 'write-college-essay-stands-out' },
      { title: 'Best Online Certifications Worth Getting in 2026', slug: 'online-certifications-worth-2026' },
      { title: 'How to Manage Time as a Student', slug: 'manage-time-student-tips' },
      { title: 'Best YouTube Channels for Learning New Skills', slug: 'youtube-channels-learning-skills' },
      { title: 'How to Prepare for Standardized Tests: SAT, ACT, GRE', slug: 'prepare-standardized-tests-guide' },
      { title: 'Best Speed Reading Techniques That Work', slug: 'speed-reading-techniques-work' },
      { title: 'How to Overcome Procrastination While Studying', slug: 'overcome-procrastination-studying' },
      { title: 'Best Scholarship Resources for College Students', slug: 'scholarship-resources-college' },
      { title: 'How to Create Effective Flashcards for Studying', slug: 'create-effective-flashcards' },
      { title: 'Best Coding Bootcamps Worth the Money in 2026', slug: 'coding-bootcamps-worth-money-2026' },
      { title: 'How to Balance Work and School Successfully', slug: 'balance-work-school-successfully' },
      { title: 'Best Research Strategies for Academic Papers', slug: 'research-strategies-academic-papers' },
      { title: 'How to Choose the Right College Major', slug: 'choose-right-college-major' },
      { title: 'Best Memory Techniques for Exam Preparation', slug: 'memory-techniques-exam-prep' },
      { title: 'How to Build a Study Group That Actually Works', slug: 'build-study-group-works' },
    ],
  },
  'relationships-dating': {
    name: 'Relationships & Dating',
    tags: ['relationships', 'dating', 'love', 'dating tips', 'relationship advice'],
    topics: [
      { title: 'Best Dating Apps for Serious Relationships in 2026', slug: 'dating-apps-serious-relationships-2026' },
      { title: 'How to Have a Great First Date: Essential Tips', slug: 'great-first-date-tips' },
      { title: 'Red Flags in Relationships Everyone Should Know', slug: 'red-flags-relationships-know' },
      { title: 'How to Improve Communication in Your Relationship', slug: 'improve-communication-relationship' },
      { title: 'Best Date Night Ideas for Couples on a Budget', slug: 'date-night-ideas-budget' },
      { title: 'How to Get Over a Breakup: Healthy Coping Strategies', slug: 'get-over-breakup-healthy' },
      { title: 'Best Long-Distance Relationship Tips That Work', slug: 'long-distance-relationship-tips' },
      { title: 'How to Know If Someone Is Interested in You', slug: 'know-someone-interested-signs' },
      { title: 'Best Conversation Starters for Any Situation', slug: 'conversation-starters-any-situation' },
      { title: 'How to Build Trust in a New Relationship', slug: 'build-trust-new-relationship' },
      { title: 'Best Relationship Books Everyone Should Read', slug: 'relationship-books-should-read' },
      { title: 'How to Navigate Dating After Divorce', slug: 'dating-after-divorce-guide' },
      { title: 'Best Ways to Show Appreciation to Your Partner', slug: 'show-appreciation-partner-ways' },
      { title: 'How to Handle Disagreements Without Fighting', slug: 'handle-disagreements-without-fighting' },
      { title: 'Best Tips for Making Friends as an Adult', slug: 'making-friends-adult-tips' },
      { title: 'How to Know When to End a Relationship', slug: 'know-when-end-relationship' },
      { title: 'Best Anniversary Gift Ideas for Every Budget', slug: 'anniversary-gift-ideas-budget' },
      { title: 'How to Set Healthy Boundaries in Relationships', slug: 'set-healthy-boundaries-relationships' },
      { title: 'Best Couple Activities for Bonding and Fun', slug: 'couple-activities-bonding-fun' },
      { title: 'How to Support a Partner with Anxiety', slug: 'support-partner-with-anxiety' },
    ],
  },
  'weird-interesting': {
    name: 'Weird & Interesting Facts',
    tags: ['interesting facts', 'weird facts', 'trivia', 'fun facts', 'curiosity'],
    topics: [
      { title: 'Weirdest Laws Still on the Books Around the World', slug: 'weirdest-laws-around-world' },
      { title: '25 Mind-Blowing Facts About the Human Body', slug: 'mind-blowing-facts-human-body' },
      { title: 'Strangest Animals You\'ve Never Heard Of', slug: 'strangest-animals-never-heard' },
      { title: 'Most Bizarre Foods People Actually Eat', slug: 'bizarre-foods-people-actually-eat' },
      { title: 'Unsolved Mysteries That Still Baffle Scientists', slug: 'unsolved-mysteries-baffle-scientists' },
      { title: 'Weirdest World Records Ever Set', slug: 'weirdest-world-records-ever-set' },
      { title: 'Fascinating Facts About Space You Didn\'t Know', slug: 'fascinating-facts-space-didnt-know' },
      { title: 'Creepiest Places on Earth You Can Actually Visit', slug: 'creepiest-places-earth-visit' },
      { title: 'Most Expensive Things Ever Sold at Auction', slug: 'most-expensive-things-sold-auction' },
      { title: 'Weird Science Experiments That Changed the World', slug: 'weird-science-experiments-changed-world' },
      { title: 'Strangest Coincidences in History', slug: 'strangest-coincidences-history' },
      { title: 'Mind-Bending Optical Illusions Explained', slug: 'optical-illusions-explained' },
      { title: 'Weirdest Inventions That Actually Made Millions', slug: 'weird-inventions-made-millions' },
      { title: 'Fascinating Facts About Dreams and Sleep', slug: 'fascinating-facts-dreams-sleep' },
      { title: 'Most Unusual Jobs That Pay Surprisingly Well', slug: 'unusual-jobs-pay-well' },
      { title: 'Strange Historical Events Nobody Talks About', slug: 'strange-historical-events-nobody-talks' },
      { title: 'Weirdest Competitions That Actually Exist', slug: 'weirdest-competitions-actually-exist' },
      { title: 'Most Fascinating Abandoned Places Around the World', slug: 'fascinating-abandoned-places-world' },
      { title: 'Weird Psychology Facts About Human Behavior', slug: 'weird-psychology-facts-behavior' },
      { title: 'Strangest Things Found in Unexpected Places', slug: 'strangest-things-found-unexpected' },
    ],
  },
};

// ─── Load dynamic categories from categories.json ───
function loadDynamicCategories() {
  if (!fs.existsSync(CATEGORIES_PATH)) return {};
  try {
    const cats = JSON.parse(fs.readFileSync(CATEGORIES_PATH, 'utf8'));
    const map = {};
    for (const cat of cats) {
      if (!CATEGORY_TOPICS[cat.slug]) {
        map[cat.slug] = {
          name: cat.name,
          tags: cat.tags || [cat.slug.replace(/-/g, ' ')],
          topics: [], // will be generated dynamically
        };
      }
    }
    return map;
  } catch { return {}; }
}

const DYNAMIC_CATEGORIES = loadDynamicCategories();

// ─── Topic generation (LLM-free) ───
// Uses a two-part approach: a noun picked from the category + a frame sentence.
// Each frame is a proven SEO title pattern.
const TITLE_FRAMES = [
  'Best {N} Products and Services in 2026',
  'How to Save Money on {N} in 2026',
  '{N} Tips and Tricks Every Beginner Should Know',
  'Top 10 {N} Mistakes to Avoid',
  '{N} for Beginners: A Complete Guide',
  'Is {N} Worth It? An Honest Look',
  '{N} Trends That Will Dominate 2026',
  'How {N} Is Changing and What It Means for You',
  'The Ultimate Guide to {N} on a Budget',
  'Common {N} Problems and How to Fix Them',
  'Best Online Resources for Learning About {N}',
  'How to Get the Most Out of {N}',
  '{N} Compared: What the Experts Recommend',
  'Why {N} Matters More Than You Think',
  'What Everyone Gets Wrong About {N}',
  '{N} Explained: Everything You Need to Know',
  'How to Choose the Right {N} for Your Needs',
  'Best {N} Alternatives You Haven\'t Tried',
  '{N} Safety Tips Every Consumer Should Know',
  'How {N} Affects Your Daily Life',
  '{N} in 2026: What Has Changed',
  'Smart Ways to Approach {N} This Year',
  'The Hidden Costs of {N} Nobody Talks About',
  'Best Apps and Tools for {N} in 2026',
  '{N} Reviews: Top Picks for Every Budget',
  'How to Start with {N} If You Know Nothing',
  'Key {N} Statistics and Facts for 2026',
  '{N} Guide: From Basics to Advanced Tips',
  'What to Expect from {N} in the Next Year',
  'How Professionals Handle {N}',
];

function titleToSlug(title) {
  return title
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '');
}

function generateTopicsForCategory(catSlug, catName, catTags, count) {
  // Build a list of noun phrases from category info
  const nouns = [];
  // From the category name — split on & / , and use each part
  const nameParts = catName.split(/[&,\/]+/).map(s => s.trim()).filter(Boolean);
  nouns.push(...nameParts);
  // From tags (capitalized)
  if (catTags) {
    for (const tag of catTags) {
      const capitalized = tag.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      if (!nouns.includes(capitalized)) nouns.push(capitalized);
    }
  }
  // Slug as noun
  const slugNoun = catSlug.replace(/-/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  if (!nouns.includes(slugNoun)) nouns.push(slugNoun);

  const topics = [];
  const usedSlugs = new Set();

  // Deterministic shuffle by category slug so each category gets a different frame order
  const seed = catSlug.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const shuffled = [...TITLE_FRAMES].sort((a, b) => {
    const ha = ((seed + a.charCodeAt(0)) * 31) % 997;
    const hb = ((seed + b.charCodeAt(0)) * 31) % 997;
    return ha - hb;
  });

  // Generate: for each noun × each frame, produce a topic
  for (let round = 0; topics.length < count; round++) {
    if (round >= nouns.length * 2) break; // safety: max 2 full rotations
    for (const frame of shuffled) {
      if (topics.length >= count) break;
      const noun = nouns[(topics.length + round) % nouns.length];
      const title = frame.replace(/\{N\}/g, noun);
      const slug = titleToSlug(title);

      if (!usedSlugs.has(slug)) {
        usedSlugs.add(slug);
        topics.push({ title, slug });
      }
    }
  }

  return topics;
}

// ─── Slug-to-category mapping (supports both hardcoded and dynamic) ───
const SLUG_TO_KEY = {};
for (const [key, val] of Object.entries(CATEGORY_TOPICS)) {
  SLUG_TO_KEY[key] = key;
  SLUG_TO_KEY[val.name.toLowerCase()] = key;
  SLUG_TO_KEY[val.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')] = key;
}
for (const [key, val] of Object.entries(DYNAMIC_CATEGORIES)) {
  SLUG_TO_KEY[key] = key;
  SLUG_TO_KEY[val.name.toLowerCase()] = key;
  SLUG_TO_KEY[val.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')] = key;
}

function resolveCategory(input) {
  const normalized = input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  // Check hardcoded first, then dynamic
  if (SLUG_TO_KEY[normalized]) return SLUG_TO_KEY[normalized];
  if (SLUG_TO_KEY[input.toLowerCase()]) return SLUG_TO_KEY[input.toLowerCase()];
  // If still not found, check categories.json directly (for newly evolved categories)
  if (fs.existsSync(CATEGORIES_PATH)) {
    try {
      const cats = JSON.parse(fs.readFileSync(CATEGORIES_PATH, 'utf8'));
      const match = cats.find(c => c.slug === normalized || c.slug === input);
      if (match) {
        DYNAMIC_CATEGORIES[match.slug] = {
          name: match.name,
          tags: match.tags || [match.slug.replace(/-/g, ' ')],
          topics: [],
        };
        SLUG_TO_KEY[match.slug] = match.slug;
        return match.slug;
      }
    } catch {}
  }

  // Last resort: accept any slug and create a category definition on-the-fly.
  // This handles categories that exist in fitness data (from Hugo frontmatter)
  // but were never formally registered in categories.json.
  const slug = normalized;
  const name = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  DYNAMIC_CATEGORIES[slug] = {
    name,
    tags: [slug.replace(/-/g, ' ')],
    topics: [],
  };
  SLUG_TO_KEY[slug] = slug;
  console.log(`Auto-registered unknown category: "${slug}" as "${name}"`);
  return slug;
}

function getCategoryDefinition(catKey) {
  if (CATEGORY_TOPICS[catKey]) return CATEGORY_TOPICS[catKey];
  if (DYNAMIC_CATEGORIES[catKey]) return DYNAMIC_CATEGORIES[catKey];
  return null;
}

// ─── Read stdin ───
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

// ─── Parse args ───
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pick-topics') parsed.mode = 'pick-topics';
    else if (args[i] === '--write-post') parsed.mode = 'write-post';
    else if (args[i] === '--category' && args[i + 1]) { parsed.category = args[++i]; }
    else if (args[i] === '--count' && args[i + 1]) { parsed.count = parseInt(args[++i], 10); }
    else if (args[i] === '--slug' && args[i + 1]) { parsed.slug = args[++i]; }
    else if (args[i] === '--title' && args[i + 1]) { parsed.title = args[++i]; }
    else if (args[i] === '--category-name' && args[i + 1]) { parsed.categoryName = args[++i]; }
    else if (args[i] === '--tags' && args[i + 1]) { parsed.tags = JSON.parse(args[++i]); }
  }

  if (!parsed.mode) {
    console.error(`Usage:
  # 토픽 선택 (JSON 출력)
  node scripts/generate-posts.js --pick-topics --category "tech-ai" --count 5

  # 본문 저장 (stdin으로 본문 입력)
  echo "본문..." | node scripts/generate-posts.js --write-post \\
    --slug "my-post" --title "My Title" --category-name "Tech & AI" --tags '["tech"]'

Available categories:`);
    for (const [key, val] of Object.entries(CATEGORY_TOPICS)) {
      console.error(`  ${key} — ${val.name}`);
    }
    if (Object.keys(DYNAMIC_CATEGORIES).length > 0) {
      for (const [key, val] of Object.entries(DYNAMIC_CATEGORIES)) {
        console.error(`  ${key} — ${val.name}`);
      }
    }
    process.exit(1);
  }

  return parsed;
}

// ─── Generate date string (30-60 min before now) ───
function generateDate() {
  const now = new Date();
  const offset = 30 + Math.floor(Math.random() * 30); // 30-60 minutes
  now.setMinutes(now.getMinutes() - offset);
  // Format as ISO with timezone offset
  const tzOffset = -now.getTimezoneOffset();
  const sign = tzOffset >= 0 ? '+' : '-';
  const hours = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, '0');
  const mins = String(Math.abs(tzOffset) % 60).padStart(2, '0');
  const tz = `${sign}${hours}:${mins}`;
  const iso = now.getFullYear() +
    '-' + String(now.getMonth() + 1).padStart(2, '0') +
    '-' + String(now.getDate()).padStart(2, '0') +
    'T' + String(now.getHours()).padStart(2, '0') +
    ':' + String(now.getMinutes()).padStart(2, '0') +
    ':' + String(now.getSeconds()).padStart(2, '0') +
    tz;
  return iso;
}

// ─── pick-topics: 사용 가능한 토픽을 JSON으로 출력 ───
function pickTopics(category, count = 5) {
  const catKey = resolveCategory(category);
  if (!catKey) {
    console.error(`Unknown category: "${category}"`);
    console.error('Available:', Object.keys(CATEGORY_TOPICS).join(', '));
    process.exit(1);
  }

  const catDef = getCategoryDefinition(catKey);
  if (!catDef) {
    console.error(`Category definition not found for: "${catKey}"`);
    process.exit(1);
  }

  const existingFiles = new Set(
    fs.existsSync(POSTS_DIR)
      ? fs.readdirSync(POSTS_DIR).map(f => f.replace(/\.md$/, ''))
      : []
  );

  let available = catDef.topics.filter(t => !existingFiles.has(t.slug));

  if (available.length < count) {
    const needed = count - available.length + 20;
    const generated = generateTopicsForCategory(catKey, catDef.name, catDef.tags, needed);
    const newTopics = generated.filter(t => !existingFiles.has(t.slug) && !catDef.topics.some(e => e.slug === t.slug));
    if (newTopics.length > 0) {
      catDef.topics.push(...newTopics);
      available = [...available, ...newTopics];
    }
  }

  const picked = available.slice(0, count);
  console.log(JSON.stringify({
    category: catKey,
    categoryName: catDef.name,
    tags: catDef.tags,
    topics: picked,
    postsDir: POSTS_DIR,
  }));
}

// ─── write-post: stdin 본문 + 인자로 파일 저장 ───
async function writePost(slug, title, categoryName, tags) {
  if (!slug || !title || !categoryName || !tags) {
    console.error('--write-post requires: --slug, --title, --category-name, --tags');
    process.exit(1);
  }

  const body = await readStdin();
  if (!body.trim()) {
    console.error('Error: empty body from stdin');
    process.exit(1);
  }

  fs.mkdirSync(POSTS_DIR, { recursive: true });

  const dateStr = generateDate();
  const frontmatter = [
    '---',
    `title: "${title.replace(/"/g, '\\"')}"`,
    `date: ${dateStr}`,
    `description: "${title.replace(/"/g, '\\"')}"`,
    `tags: ${JSON.stringify(tags)}`,
    `categories: ["${categoryName}"]`,
    `draft: false`,
    '---',
    '',
  ].join('\n');

  const content = frontmatter + body.trim() + '\n';
  const filePath = path.join(POSTS_DIR, `${slug}.md`);
  fs.writeFileSync(filePath, content);
  console.log(JSON.stringify({ saved: filePath, slug, title }));
}

// ─── Main ───
async function main() {
  const args = parseArgs();

  if (args.mode === 'pick-topics') {
    if (!args.category) {
      console.error('--pick-topics requires --category');
      process.exit(1);
    }
    pickTopics(args.category, args.count || 5);
  } else if (args.mode === 'write-post') {
    await writePost(args.slug, args.title, args.categoryName, args.tags);
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
