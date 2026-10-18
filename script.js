import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const API_BASE_URL = "https://47yc2kz3nb.execute-api.ap-south-1.amazonaws.com";

const ADMIN_EMAILS = ["akshaydasari04216@gmail.com"];
const ADMIN_PHONES = ["+918688724589", "+918978254104", "8688724589", "8978254104"];

const firebaseConfig = {
  apiKey: "AIzaSyB4jd0FJsGJvaOEmAQ2mk9m0BWrdlw9G88",
  authDomain: "legacywear-e1b33.firebaseapp.com",
  projectId: "legacywear-e1b33",
  storageBucket: "legacywear-e1b33.firebasestorage.app",
  messagingSenderId: "1039592675543",
  appId: "1:1039592675543:web:2c00c13e9c68c4d943f892",
  measurementId: "G-7BGFCQYNDT"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

function safeGetStorage(key, fallback) {
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : fallback;
  } catch (e) {
    return fallback;
  }
}

function safeSetStorage(key, val) {
  try {
    localStorage.setItem(key, typeof val === "string" ? val : JSON.stringify(val));
  } catch (e) {}
}

let allProducts = [];
let allSections = [];
let currentUser = null;
let isAdminUser = false;
let shoppingBag = safeGetStorage("lw_bag", []);
let selectedSizes = {};
let uploadedProductImageUrls = [];

let productReviews = safeGetStorage("lw_reviews", {});
let activeReviewProductId = null;
let selectedStarCount = 5;

let lightboxImages = [];
let lightboxIndex = 0;
let pendingCancelOrderId = null;
let latestCustomerOrdersSignature = "";
let cachedOrdersList = [];

document.addEventListener("DOMContentLoaded", () => {
  bindUIEvents();
  restoreSavedAddress();
  updateBagCounter();
  loadStoreCatalog();
});

function restoreSavedAddress() {
  const saved = safeGetStorage("lw_saved_address", null);
  if (!saved) return;
  if (saved.name && document.getElementById("custName")) document.getElementById("custName").value = saved.name;
  if (saved.phone && document.getElementById("custPhone")) document.getElementById("custPhone").value = saved.phone;
  if (saved.pincode && document.getElementById("custPincode")) document.getElementById("custPincode").value = saved.pincode;
  if (saved.locality && document.getElementById("custLocality")) document.getElementById("custLocality").value = saved.locality;
  if (saved.house && document.getElementById("custHouse")) document.getElementById("custHouse").value = saved.house;
  if (saved.city && document.getElementById("custCity")) document.getElementById("custCity").value = saved.city;
  if (saved.state && document.getElementById("custState")) document.getElementById("custState").value = saved.state;
  if (saved.landmark && document.getElementById("custLandmark")) document.getElementById("custLandmark").value = saved.landmark;
  if (saved.altPhone && document.getElementById("custAltPhone")) document.getElementById("custAltPhone").value = saved.altPhone;
  if (saved.addrType && document.getElementById("custAddrType")) {
    document.getElementById("custAddrType").value = saved.addrType;
    document.querySelectorAll(".fk-type-pill").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.addrType === saved.addrType);
    });
  }
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  const userInitials = document.getElementById("userInitials");
  const menuGreeting = document.getElementById("menuUserGreeting");
  const googleSignInBtn = document.getElementById("googleSignInBtn");
  const signOutBtn = document.getElementById("signOutBtn");
  const adminHeaderBtn = document.getElementById("adminHeaderBtn");
  const openAdminFromMenuBtn = document.getElementById("openAdminFromMenuBtn");

  if (user) {
    const email = (user.email || "").toLowerCase();
    const phone = user.phoneNumber || "";
    isAdminUser = ADMIN_EMAILS.includes(email) || ADMIN_PHONES.includes(phone);

    const name = user.displayName || user.email || "Member";
    userInitials.textContent = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
    menuGreeting.textContent = `Hi, ${name}`;

    googleSignInBtn.classList.add("hidden");
    signOutBtn.classList.remove("hidden");
    adminHeaderBtn.classList.toggle("hidden", !isAdminUser);
    openAdminFromMenuBtn.classList.toggle("hidden", !isAdminUser);

    if (document.getElementById("reviewerNameInput")) document.getElementById("reviewerNameInput").value = name;
    if (document.getElementById("custName") && !document.getElementById("custName").value) {
      document.getElementById("custName").value = name;
    }

    fetchMyOrders(user.uid, false);
    if (isAdminUser) checkAdminOrderNotifications();
  } else {
    isAdminUser = false;
    userInitials.textContent = "SIGN IN";
    menuGreeting.textContent = "Welcome to Legacy°";
    googleSignInBtn.classList.remove("hidden");
    signOutBtn.classList.add("hidden");
    adminHeaderBtn.classList.add("hidden");
    openAdminFromMenuBtn.classList.add("hidden");
    document.getElementById("myOrdersList").innerHTML = `<p class="muted-text">Sign in to view and track your orders.</p>`;
  }
});

async function loadStoreCatalog() {
  const grid = document.getElementById("productGrid");
  try {
    const [secRes, prodRes] = await Promise.all([
      fetch(`${API_BASE_URL}/sections`),
      fetch(`${API_BASE_URL}/products`)
    ]);

    allSections = secRes.ok ? await secRes.json() : [];
    allProducts = prodRes.ok ? await prodRes.json() : [];

    populateCategoryDropdowns();
    seedInitialReviewsIfEmpty();
    renderProducts();
    if (isAdminUser) {
      renderAdminProductsList();
      renderAdminSectionsList();
      checkAdminOrderNotifications();
    }
  } catch (err) {
    console.error("Error loading catalog:", err);
    grid.innerHTML = `<div class="grid-status">Unable to load products right now. Tap Refresh or check connection.</div>`;
  }
}

function populateCategoryDropdowns() {
  const filterSelect = document.getElementById("categoryFilter");
  const adminSecSelect = document.getElementById("prodSectionSelect");

  filterSelect.innerHTML = `<option value="all">Category: All Drops</option>`;
  adminSecSelect.innerHTML = `<option value="">Select Category Section</option>`;

  allSections.forEach(sec => {
    const opt1 = document.createElement("option");
    opt1.value = sec.sectionId;
    opt1.textContent = sec.title;
    filterSelect.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = sec.sectionId;
    opt2.textContent = sec.title;
    adminSecSelect.appendChild(opt2);
  });
}

function seedInitialReviewsIfEmpty() {
  let changed = false;
  allProducts.forEach((p) => {
    const id = p.productId || p.id || p.title;
    if (!productReviews[id] || productReviews[id].length === 0) {
      productReviews[id] = [
        {
          name: "Verified Member",
          stars: 5,
          comment: "Heavyweight fabric and clean oversized fit.",
          date: "Oct 2026"
        }
      ];
      changed = true;
    }
  });
  if (changed) {
    safeSetStorage("lw_reviews", productReviews);
  }
}

function getProductRatingStats(productId) {
  const list = productReviews[productId] || [];
  if (list.length === 0) return { avg: 5.0, count: 0, starsHtml: "★★★★★" };
  const sum = list.reduce((acc, r) => acc + Number(r.stars || 5), 0);
  const avg = (sum / list.length).toFixed(1);
  const rounded = Math.round(avg);
  const starsHtml = "★".repeat(rounded) + "☆".repeat(5 - rounded);
  return { avg: Number(avg), count: list.length, starsHtml };
}

function renderProducts() {
  const grid = document.getElementById("productGrid");
  const searchVal = document.getElementById("searchInput").value.trim().toLowerCase();
  const sortVal = document.getElementById("sortSelect").value;
  const catVal = document.getElementById("categoryFilter").value;
  const sizeVal = document.getElementById("sizeFilter").value;
  const ratingVal = Number(document.getElementById("ratingFilter").value);
  const priceVal = document.getElementById("priceFilter").value;

  let filtered = allProducts.filter(p => p.isAvailable !== false);

  if (searchVal) {
    filtered = filtered.filter(p => (p.title || "").toLowerCase().includes(searchVal));
  }

  if (catVal !== "all") {
    filtered = filtered.filter(p => p.sectionId === catVal);
    const secObj = allSections.find(s => s.sectionId === catVal);
    document.getElementById("activeCategoryCrumb").textContent = secObj ? secObj.title : "Collection";
  } else {
    document.getElementById("activeCategoryCrumb").textContent = "All Drops";
  }

  if (sizeVal !== "all") {
    filtered = filtered.filter(p => {
      if (!p.sizes) return true;
      return Number(p.sizes[sizeVal] || 0) > 0 || p.sizes[sizeVal] === true;
    });
  }

  if (ratingVal > 0) {
    filtered = filtered.filter(p => {
      const id = p.productId || p.id || p.title;
      return getProductRatingStats(id).avg >= ratingVal;
    });
  }

  if (priceVal === "under-699") {
    filtered = filtered.filter(p => Number(p.price) < 700);
  } else if (priceVal === "700-999") {
    filtered = filtered.filter(p => Number(p.price) >= 700 && Number(p.price) <= 999);
  } else if (priceVal === "1000-plus") {
    filtered = filtered.filter(p => Number(p.price) >= 1000);
  }

  if (sortVal === "price-asc") {
    filtered.sort((a, b) => Number(a.price) - Number(b.price));
  } else if (sortVal === "price-desc") {
    filtered.sort((a, b) => Number(b.price) - Number(a.price));
  } else if (sortVal === "rating") {
    filtered.sort((a, b) => {
      const idA = a.productId || a.id || a.title;
      const idB = b.productId || b.id || b.title;
      return getProductRatingStats(idB).avg - getProductRatingStats(idA).avg;
    });
  }

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="grid-status">No matching clothes found. Try resetting your filters.</div>`;
    return;
  }

  grid.innerHTML = "";

  filtered.forEach(product => {
    const pid = product.productId || product.id || product.title;
    const images = Array.isArray(product.images) && product.images.length > 0
      ? product.images
      : [product.image || "https://via.placeholder.com/400x400?text=Legacy+Wear"];

    const stats = getProductRatingStats(pid);
    const chosenSize = selectedSizes[pid] || "L";
    const availableSizes = ["S", "M", "L", "XL", "XXL"];

    const card = document.createElement("article");
    card.className = "product-card";

    card.innerHTML = `
      <div class="card-top">
        <div class="card-top-badges">
          <span class="card-brand">Legacy Wear K.P.D</span>
          ${product.isLatest ? `<span class="new-badge">NEW DROP</span>` : ""}
        </div>
        <p class="card-subtitle">${product.title}</p>

        <div class="card-rating-row" data-review-pid="${pid}" title="Click to read or write reviews">
          <span class="card-stars">${stats.starsHtml}</span>
          <span class="card-review-count">${stats.avg} (${stats.count})</span>
        </div>
      </div>

      <div class="card-image-wrap" data-lightbox-pid="${pid}">
        <img src="${images[0]}" alt="${product.title}" loading="lazy" />
        <span class="fullscreen-hint">⛶ ${images.length}</span>
      </div>

      <div>
        <div class="size-row" data-size-group="${pid}">
          ${availableSizes.map(sz => `
            <button type="button" class="size-pill ${chosenSize === sz ? "selected" : ""}" data-pid="${pid}" data-size="${sz}">
              ${sz}
            </button>
          `).join("")}
        </div>

        <div class="card-bottom">
          <div class="designer-col">
            <span class="designer-label">EDITION</span>
            <span class="designer-name">Legacy Studio</span>
            <button type="button" class="review-link-btn" data-review-pid="${pid}">
              ★ Rate &amp; Review
            </button>
          </div>
          <div class="price-col">
            ${product.originalPrice ? `<span class="old-price">₹${product.originalPrice}</span>` : ""}
            <span class="current-price">₹${product.price}</span>
          </div>
        </div>

        <div class="card-actions">
          <button type="button" class="btn-bag" data-add-pid="${pid}">+ Bag</button>
          <button type="button" class="btn-buy" data-buy-pid="${pid}">Buy Now</button>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });

  attachCardListeners();
}

function attachCardListeners() {
  document.querySelectorAll(".size-pill").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const pid = e.currentTarget.dataset.pid;
      const sz = e.currentTarget.dataset.size;
      selectedSizes[pid] = sz;
      renderProducts();
    });
  });

  document.querySelectorAll("[data-lightbox-pid]").forEach(box => {
    box.addEventListener("click", (e) => openLightbox(e.currentTarget.dataset.lightboxPid));
  });

  document.querySelectorAll("[data-review-pid]").forEach(btn => {
    btn.addEventListener("click", (e) => openReviewsModal(e.currentTarget.dataset.reviewPid));
  });

  document.querySelectorAll("[data-add-pid]").forEach(btn => {
    btn.addEventListener("click", (e) => addToBag(e.currentTarget.dataset.addPid, false));
  });

  document.querySelectorAll("[data-buy-pid]").forEach(btn => {
    btn.addEventListener("click", (e) => addToBag(e.currentTarget.dataset.buyPid, true));
  });
}

function openLightbox(pid) {
  const product = allProducts.find(p => (p.productId || p.id || p.title) === pid);
  if (!product) return;

  lightboxImages = Array.isArray(product.images) && product.images.length > 0
    ? product.images
    : [product.image];
  lightboxIndex = 0;

  document.getElementById("lightboxTitle").textContent = product.title;
  document.getElementById("lightboxPrice").textContent = `₹${product.price}`;
  document.getElementById("lightboxImgContainer").classList.remove("zoomed");

  updateLightboxStage();
  document.getElementById("lightboxModal").classList.remove("hidden");
}

function updateLightboxStage() {
  document.getElementById("lightboxMainImg").src = lightboxImages[lightboxIndex];
  const thumbsContainer = document.getElementById("lightboxThumbs");
  thumbsContainer.innerHTML = lightboxImages.map((imgUrl, idx) => `
    <img src="${imgUrl}" class="lb-thumb ${idx === lightboxIndex ? "active" : ""}" data-idx="${idx}" alt="Thumb" />
  `).join("");

  thumbsContainer.querySelectorAll(".lb-thumb").forEach(t => {
    t.addEventListener("click", (e) => {
      lightboxIndex = Number(e.currentTarget.dataset.idx);
      updateLightboxStage();
    });
  });
}

function openReviewsModal(pid) {
  const product = allProducts.find(p => (p.productId || p.id || p.title) === pid);
  if (!product) return;

  activeReviewProductId = pid;
  document.getElementById("reviewModalProductTitle").textContent = product.title;
  renderReviewsModalContent();
  document.getElementById("reviewsModal").classList.remove("hidden");
}

function renderReviewsModalContent() {
  const stats = getProductRatingStats(activeReviewProductId);
  document.getElementById("reviewModalAvgScore").textContent = stats.avg.toFixed(1);
  document.getElementById("reviewModalStars").textContent = stats.starsHtml;
  document.getElementById("reviewModalCount").textContent = `Based on ${stats.count} customer review(s)`;

  const list = productReviews[activeReviewProductId] || [];
  const container = document.getElementById("reviewsListContainer");

  if (list.length === 0) {
    container.innerHTML = `<p class="muted-text">No reviews yet. Be the first to rate this piece!</p>`;
    return;
  }

  container.innerHTML = list.slice().reverse().map(r => `
    <div class="review-item">
      <div class="review-item-head">
        <span>${r.name}</span>
        <span style="color:#fbbf24;">${"★".repeat(r.stars)}${"☆".repeat(5 - r.stars)}</span>
      </div>
      <p class="review-item-text">${r.comment}</p>
    </div>
  `).join("");
}

function addToBag(pid, openDrawerImmediately) {
  const product = allProducts.find(p => (p.productId || p.id || p.title) === pid);
  if (!product) return;

  const size = selectedSizes[pid] || "L";
  shoppingBag.push({
    productId: pid,
    title: product.title,
    price: Number(product.price),
    size,
    image: Array.isArray(product.images) ? product.images[0] : product.image
  });

  safeSetStorage("lw_bag", shoppingBag);
  updateBagCounter();
  showToast(`Added ${product.title} (${size}) to bag`);

  if (openDrawerImmediately) openBagDrawer();
}

function updateBagCounter() {
  document.getElementById("bagCount").textContent = shoppingBag.length;
}

function openBagDrawer() {
  const container = document.getElementById("bagItemsContainer");
  const totalEl = document.getElementById("bagTotalPrice");

  if (shoppingBag.length === 0) {
    container.innerHTML = `<p class="muted-text" style="padding: 14px 0;">Your bag is empty. Add clothes to place an order.</p>`;
    totalEl.textContent = "₹0";
  } else {
    let total = 0;
    container.innerHTML = shoppingBag.map((item, idx) => {
      total += Number(item.price);
      return `
        <div class="bag-item">
          <div>
            <strong>${item.title}</strong>
            <div class="muted-text">Size: ${item.size} • ₹${item.price}</div>
          </div>
          <button class="close-x" data-remove-idx="${idx}">✕</button>
        </div>
      `;
    }).join("");
    totalEl.textContent = `₹${total}`;

    container.querySelectorAll("[data-remove-idx]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const idx = Number(e.currentTarget.dataset.removeIdx);
        shoppingBag.splice(idx, 1);
        safeSetStorage("lw_bag", shoppingBag);
        updateBagCounter();
        openBagDrawer();
      });
    });
  }
  document.getElementById("bagModal").classList.remove("hidden");
}

function buildOrderTrackingStepper(rawStatus) {
  const st = (rawStatus || "CONFIRMED").toUpperCase();
  if (st === "CANCELLED") {
    return `<div class="cancel-reason-alert" style="margin-top:4px;">❌ Order Status: <strong>CANCELLED</strong></div>`;
  }

  const stages = [
    { key: "CONFIRMED", label: "Confirmed" },
    { key: "PACKED", label: "Packed" },
    { key: "SHIPPED", label: "Shipped" },
    { key: "DELIVERED", label: "Delivered" }
  ];

  let activeIdx = 0;
  if (st === "PACKED") activeIdx = 1;
  else if (st === "SHIPPED" || st === "OUT FOR DELIVERY") activeIdx = 2;
  else if (st === "DELIVERED") activeIdx = 3;

  return `
    <div class="track-stepper">
      ${stages.map((stage, idx) => {
        const stateClass = idx < activeIdx ? "done" : (idx === activeIdx ? "active" : "");
        const icon = idx <= activeIdx ? "✓" : "";
        const displayLabel = (idx === 2 && st === "OUT FOR DELIVERY") ? "Out for Delivery" : stage.label;
        return `
          <div class="track-step ${stateClass}">
            <div class="track-dot">${icon}</div>
            <span class="track-label">${displayLabel}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

// PRINTABLE INVOICE GENERATOR FEATURE
window.printOrderInvoice = function(orderId) {
  const order = cachedOrdersList.find(o => o.orderId === orderId);
  if (!order) {
    showToast("Invoice data not found");
    return;
  }

  document.getElementById("invOrderId").textContent = `Order #${order.orderId}`;
  document.getElementById("invOrderDate").textContent = `Date: ${new Date(order.createdAt).toLocaleDateString("en-IN")}`;
  document.getElementById("invCustName").textContent = order.customerName || "Customer";
  document.getElementById("invCustPhone").textContent = `Phone: ${order.phone || ""}`;
  document.getElementById("invCustAddress").textContent = `Address: ${order.address || ""}`;
  document.getElementById("invTotalAmount").textContent = `₹${order.totalAmount || 0}`;

  const tbody = document.getElementById("invItemsTableBody");
  tbody.innerHTML = (order.items || []).map(i => `
    <tr style="border-bottom:1px solid #eee;">
      <td style="padding:8px;">${i.title}</td>
      <td style="text-align:center; padding:8px;">${i.size}</td>
      <td style="text-align:right; padding:8px;">₹${i.price}</td>
    </tr>
  `).join("");

  const printWindow = window.open('', '_blank');
  printWindow.document.write('<html><head><title>Invoice - Legacy Wear K.P.D</title></head><body>');
  printWindow.document.write(document.getElementById("invoicePrintTemplate").innerHTML);
  printWindow.document.write('</body></html>');
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
};

async function fetchMyOrders(uid, markAsSeen = false) {
  const box = document.getElementById("myOrdersList");
  const menuDot = document.getElementById("myOrdersDot");
  const drawerDot = document.getElementById("myOrdersDrawerDot");

  try {
    const res = await fetch(`${API_BASE_URL}/orders?userId=${encodeURIComponent(uid)}`);
    if (!res.ok) return;
    const orders = await res.json();
    cachedOrdersList = orders;

    if (!orders || orders.length === 0) {
      box.innerHTML = `<p class="muted-text">No past orders found yet.</p>`;
      return;
    }

    latestCustomerOrdersSignature = orders.map(o => `${o.orderId}:${o.status}:${o.cancelReason || ""}`).join("|");
    const savedSig = localStorage.getItem(`lw_cust_sig_${uid}`);

    if (markAsSeen || !savedSig) {
      safeSetStorage(`lw_cust_sig_${uid}`, latestCustomerOrdersSignature);
      if (menuDot) menuDot.classList.add("hidden");
      if (drawerDot) drawerDot.classList.add("hidden");
    } else if (savedSig !== latestCustomerOrdersSignature) {
      if (menuDot) menuDot.classList.remove("hidden");
      if (drawerDot) drawerDot.classList.remove("hidden");
    }

    // AI RECOMMENDATIONS & AI RECS BUILDER
    const recsHtml = buildAiRecommendationsHtml();

    box.innerHTML = orders.map(o => {
      const isCancelled = (o.status || "").toUpperCase() === "CANCELLED";
      const badgeColor = isCancelled ? "#ff5263" : "#10b981";
      const itemsSummary = (o.items || []).map(i => `${i.title} (${i.size})`).join(", ");
      const addrType = o.addressDetails?.addrType || "Home";
      const dateStr = o.createdAt
        ? new Date(o.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
        : "";

      return `
        <div class="order-track-card">
          <div class="review-item-head">
            <span>Order #${(o.orderId || "").slice(-6)}</span>
            <span style="color:${badgeColor};">${(o.status || "CONFIRMED").toUpperCase()}</span>
          </div>
          <p class="review-item-text" style="color:#f3f4f8;font-weight:600;">${itemsSummary} • <strong style="color:#10b981;">₹${o.totalAmount || 0}</strong></p>
          <div class="muted-text" style="font-size:11px;">
            <span class="order-addr-badge">${addrType}</span>
            ${o.address || ""}
          </div>
          <div class="muted-text" style="font-size:10.5px;">Ordered: ${dateStr}</div>
          ${buildOrderTrackingStepper(o.status)}
          ${o.cancelReason ? `<div class="cancel-reason-alert">⚠️ Cancellation Reason: ${o.cancelReason}</div>` : ""}
          <div style="display:flex; justify-content:flex-end; margin-top:6px;">
            <button type="button" class="sm-btn" onclick="printOrderInvoice('${o.orderId}')">🖨️ Download Invoice</button>
          </div>
        </div>
      `;
    }).join("") + recsHtml;
  } catch (e) {
    console.error("Error fetching customer orders:", e);
  }
}

// AI RECOMMENDATIONS GENERATOR
function buildAiRecommendationsHtml() {
  if (!allProducts || allProducts.length === 0) return "";
  const shuffled = [...allProducts].sort(() => 0.5 - Math.random()).slice(0, 3);
  return `
    <div class="ai-recommend-section">
      <h4 style="font-size:12px;font-weight:800;color:var(--gold-primary);text-transform:uppercase;">✨ AI Recommended For You</h4>
      <div class="ai-recommend-grid">
        ${shuffled.map(p => {
          const img = (p.images && p.images[0]) || p.image || "https://via.placeholder.com/200";
          return `
            <div class="ai-rec-card" onclick="openLightbox('${p.productId || p.id || p.title}')">
              <img src="${img}" alt="${p.title}" />
              <div style="font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.title}</div>
              <div style="font-size:11px;color:var(--neon-green);font-weight:800;">₹${p.price}</div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

async function checkAdminOrderNotifications() {
  if (!isAdminUser) return;
  try {
    const res = await fetch(`${API_BASE_URL}/admin/orders`);
    if (!res.ok) return;
    const orders = await res.json();

    const currentSignature = orders.map(o => o.orderId).join(",");
    const lastSeenSig = localStorage.getItem("lw_admin_seen_orders_sig");
    const hubDot = document.getElementById("ordersHubDot");
    const headerDot = document.getElementById("adminHeaderDot");

    if (lastSeenSig === null) {
      safeSetStorage("lw_admin_seen_orders_sig", currentSignature);
    } else if (currentSignature !== lastSeenSig && orders.length > 0) {
      if (hubDot) hubDot.classList.remove("hidden");
      if (headerDot) headerDot.classList.remove("hidden");
    }
  } catch (err) {
    console.error("Error checking admin notifications:", err);
  }
}

function clearAdminOrderNotificationDots(ordersList) {
  const hubDot = document.getElementById("ordersHubDot");
  const headerDot = document.getElementById("adminHeaderDot");
  if (hubDot) hubDot.classList.add("hidden");
  if (headerDot) headerDot.classList.add("hidden");
  if (Array.isArray(ordersList)) {
    const sig = ordersList.map(o => o.orderId).join(",");
    safeSetStorage("lw_admin_seen_orders_sig", sig);
  }
}

function openAdminModal() {
  if (!isAdminUser) {
    showToast("Sign in with your Admin account to access the Control Desk.");
    return;
  }
  document.getElementById("menuModal").classList.add("hidden");
  renderAdminProductsList();
  renderAdminSectionsList();
  fetchAdminOrders(true);
  document.getElementById("adminModal").classList.remove("hidden");
}

async function compressAndUploadImage(file) {
  const base64DataUrl = await new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const maxDim = 720;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
          else { w = Math.round((w * maxDim) / h); h = maxDim; }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
        URL.revokeObjectURL(objectUrl);
        resolve(dataUrl);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };
    img.src = objectUrl;
  });

  const res = await fetch(`${API_BASE_URL}/admin/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageBase64: base64DataUrl,
      filename: file.name.replace(/\s+/g, "_"),
      contentType: "image/jpeg"
    })
  });

  if (!res.ok) throw new Error("Upload failed");
  const data = await res.json();
  return data.fileUrl || data.url || data.imageUrl;
}

function renderAdminProductsList() {
  const container = document.getElementById("adminProductsList");
  if (!container) return;

  if (allProducts.length === 0) {
    container.innerHTML = `<p class="muted-text">No products in catalog yet.</p>`;
    return;
  }

  container.innerHTML = allProducts.map(p => {
    const pid = p.productId || p.id;
    const img = Array.isArray(p.images) && p.images[0] ? p.images[0] : "";
    return `
      <div class="admin-row-item">
        <div style="display:flex;align-items:center;gap:12px;">
          ${img ? `<img src="${img}" style="width:44px;height:44px;border-radius:10px;object-fit:cover;" />` : ""}
          <div>
            <strong>${p.title}</strong>
            <div class="muted-text">₹${p.price} • ${p.isAvailable !== false ? "In Stock" : "Out of Stock"}</div>
          </div>
        </div>
        <div class="admin-row-actions">
          <button type="button" class="sm-btn" data-toggle-stock="${pid}">
            ${p.isAvailable !== false ? "Mark Out" : "Mark In"}
          </button>
          <button type="button" class="sm-btn" data-edit-prod="${pid}">Edit</button>
          <button type="button" class="sm-btn danger" data-del-prod="${pid}">Delete</button>
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll("[data-toggle-stock]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const pid = e.currentTarget.dataset.toggleStock;
      const prod = allProducts.find(x => (x.productId || x.id) === pid);
      if (!prod) return;
      await fetch(`${API_BASE_URL}/admin/products/${encodeURIComponent(pid)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...prod, isAvailable: prod.isAvailable === false })
      });
      showToast("Updated product stock status");
      loadStoreCatalog();
    });
  });

  container.querySelectorAll("[data-edit-prod]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const pid = e.currentTarget.dataset.editProd;
      const prod = allProducts.find(x => (x.productId || x.id) === pid);
      if (!prod) return;

      document.getElementById("editProductId").value = pid;
      document.getElementById("prodTitle").value = prod.title || "";
      document.getElementById("prodSectionSelect").value = prod.sectionId || "";
      document.getElementById("prodPrice").value = prod.price || "";
      document.getElementById("prodOriginalPrice").value = prod.originalPrice || "";
      document.getElementById("prodIsLatest").checked = !!prod.isLatest;
      document.getElementById("prodIsAvailable").checked = prod.isAvailable !== false;

      const sizes = prod.sizes || {};
      document.getElementById("stockS").value = sizes.S ?? 5;
      document.getElementById("stockM").value = sizes.M ?? 10;
      document.getElementById("stockL").value = sizes.L ?? 10;
      document.getElementById("stockXL").value = sizes.XL ?? 5;
      document.getElementById("stockXXL").value = sizes.XXL ?? 5;

      uploadedProductImageUrls = Array.isArray(prod.images) ? [...prod.images] : [];
      renderUploadedPreviews();
      document.getElementById("cancelEditProductBtn").classList.remove("hidden");
    });
  });

  container.querySelectorAll("[data-del-prod]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const pid = e.currentTarget.dataset.delProd;
      if (!confirm("Delete this product permanently?")) return;
      await fetch(`${API_BASE_URL}/admin/products/${encodeURIComponent(pid)}`, {
        method: "DELETE"
      });
      showToast("Product deleted");
      loadStoreCatalog();
    });
  });
}

function renderUploadedPreviews() {
  const box = document.getElementById("uploadedPhotosPreview");
  box.innerHTML = uploadedProductImageUrls.map(url => `<img src="${url}" alt="Uploaded" />`).join("");
  document.getElementById("uploadStatusText").textContent =
    `${uploadedProductImageUrls.length} photo(s) ready for this product.`;
}

function renderAdminSectionsList() {
  const container = document.getElementById("adminSectionsList");
  if (!container) return;

  if (allSections.length === 0) {
    container.innerHTML = `<p class="muted-text">No sections created yet.</p>`;
    return;
  }

  container.innerHTML = allSections.map(s => `
    <div class="admin-row-item">
      <div>
        <strong>${s.title}</strong>
        <div class="muted-text">Order: ${s.displayOrder || 1}</div>
      </div>
      <div class="admin-row-actions">
        <button type="button" class="sm-btn danger" data-del-sec="${s.sectionId}">Delete</button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll("[data-del-sec]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const sid = e.currentTarget.dataset.delSec;
      if (!confirm("Delete this section?")) return;
      await fetch(`${API_BASE_URL}/admin/sections/${encodeURIComponent(sid)}`, {
        method: "DELETE"
      });
      showToast("Section deleted");
      loadStoreCatalog();
    });
  });
}

// 1-CLICK WHATSAPP STATUS DISPATCH FEATURE
window.sendWhatsAppStatus = function(phone, orderId, status) {
  const cleanPhone = (phone || "").replace(/\D/g, "");
  const msg = encodeURIComponent(`Hello from Legacy Wear K.P.D! Your order #${orderId.slice(-5)} status has been updated to: *${status}*. Thank you for shopping with us!`);
  window.open(`https://wa.me/91${cleanPhone}?text=${msg}`, '_blank');
};

async function fetchAdminOrders(clearDots = false) {
  const container = document.getElementById("adminOrdersList");
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE_URL}/admin/orders`);
    if (!res.ok) return;
    const orders = await res.json();
    cachedOrdersList = orders;

    if (clearDots) {
      clearAdminOrderNotificationDots(orders);
    }

    if (!orders || orders.length === 0) {
      container.innerHTML = `<p class="muted-text">No customer orders yet.</p>`;
      return;
    }

    const statusOptions = ["CONFIRMED", "PACKED", "SHIPPED", "OUT FOR DELIVERY", "DELIVERED", "CANCELLED"];

    container.innerHTML = orders.map(o => {
      const itemsText = (o.items || []).map(i => `${i.title} (${i.size})`).join(", ");
      const dateStr = o.createdAt
        ? new Date(o.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
        : "";
      const currentSt = (o.status || "CONFIRMED").toUpperCase();
      const isCancelled = currentSt === "CANCELLED";
      const addrType = o.addressDetails?.addrType || "Home";
      const altPhone = o.addressDetails?.altPhone ? ` (Alt: ${o.addressDetails.altPhone})` : "";

      return `
        <div class="admin-row-item" id="admin-order-row-${o.orderId}">
          <div style="flex:1;min-width:220px;">
            <div>
              <span class="order-addr-badge">${addrType}</span>
              <strong>${o.customerName || "Customer"} — ${o.phone || ""}${altPhone}</strong>
            </div>
            <div class="muted-text" style="margin-top:4px;color:#e2e8f0;">📍 ${o.address || ""}</div>
            <div style="font-size:12px;color:#cbd5e1;margin-top:4px;">
              🛍️ Items: <strong>${itemsText}</strong> • <strong style="color:#10b981;">₹${o.totalAmount || 0}</strong> (${o.paymentMethod || "COD"})
            </div>
            <div class="muted-text" style="font-size:11px;margin-top:2px;">🕒 ${dateStr}</div>
            <div style="font-size:11.5px;color:${isCancelled ? '#ff5263' : '#d4af37'};margin-top:4px;">
              Current Status: <strong>${currentSt}</strong>
              ${o.cancelReason ? `<br><span style="color:#fda4af;">Cancellation Reason: ${o.cancelReason}</span>` : ""}
            </div>
          </div>
          <div class="admin-row-actions">
            <select class="admin-status-select" data-status-order-id="${o.orderId}">
              ${statusOptions.map(st => `<option value="${st}" ${currentSt === st ? "selected" : ""}>Track: ${st}</option>`).join("")}
            </select>
            <button type="button" class="sm-btn whatsapp-btn" onclick="sendWhatsAppStatus('${o.phone}', '${o.orderId}', '${currentSt}')">💬 WhatsApp</button>
            <button type="button" class="sm-btn" data-cancel-order-btn="${o.orderId}">Cancel w/ Note</button>
            <button type="button" class="sm-btn danger" data-delete-order-btn="${o.orderId}">Delete</button>
          </div>
        </div>
      `;
    }).join("");

    container.querySelectorAll("[data-status-order-id]").forEach(selectEl => {
      selectEl.addEventListener("change", async (e) => {
        const oid = e.currentTarget.dataset.statusOrderId;
        const newStatus = e.currentTarget.value;

        if (newStatus === "CANCELLED") {
          pendingCancelOrderId = oid;
          document.getElementById("cancelReasonInput").value = "";
          document.getElementById("cancelReasonModal").classList.remove("hidden");
          return;
        }

        try {
          const res = await fetch(`${API_BASE_URL}/admin/orders/${encodeURIComponent(oid)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus, cancelReason: "" })
          });
          if (res.ok) {
            showToast(`Order #${oid.slice(-5)} updated to ${newStatus}`);
            fetchAdminOrders(true);
            if (currentUser) fetchMyOrders(currentUser.uid, false);
          } else {
            showToast("Failed to update order status");
          }
        } catch (err) {
          showToast("Network error updating status");
        }
      });
    });

    container.querySelectorAll("[data-cancel-order-btn]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        pendingCancelOrderId = e.currentTarget.dataset.cancelOrderBtn;
        document.getElementById("cancelReasonInput").value = "";
        document.getElementById("cancelReasonModal").classList.remove("hidden");
      });
    });

    container.querySelectorAll("[data-delete-order-btn]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const oid = e.currentTarget.dataset.deleteOrderBtn;
        if (!confirm("Delete this order permanently from history?")) return;
        try {
          const res = await fetch(`${API_BASE_URL}/admin/orders/${encodeURIComponent(oid)}`, {
            method: "DELETE"
          });
          if (res.ok) {
            showToast("Order deleted from history");
            fetchAdminOrders(true);
            if (currentUser) fetchMyOrders(currentUser.uid, false);
          } else {
            showToast("Failed to delete order");
          }
        } catch (err) {
          showToast("Network error deleting order");
        }
      });
    });
  } catch (err) {
    console.error("Failed to fetch admin orders:", err);
  }
}

function bindUIEvents() {
  document.getElementById("searchInput").addEventListener("input", renderProducts);
  document.getElementById("sortSelect").addEventListener("change", renderProducts);
  document.getElementById("categoryFilter").addEventListener("change", renderProducts);
  document.getElementById("sizeFilter").addEventListener("change", renderProducts);
  document.getElementById("ratingFilter").addEventListener("change", renderProducts);
  document.getElementById("priceFilter").addEventListener("change", renderProducts);
  document.getElementById("resetFiltersBtn").addEventListener("click", window.resetAllFilters);

  const pincodeInput = document.getElementById("custPincode");
  if (pincodeInput) {
    pincodeInput.addEventListener("input", async (e) => {
      const pin = e.target.value.replace(/\D/g, "");
      e.target.value = pin;
      const statusSpan = document.getElementById("pincodeLookupStatus");
      if (pin.length === 6) {
        if (statusSpan) statusSpan.textContent = "Checking...";
        try {
          const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
          const data = await res.json();
          if (data && data[0] && data[0].Status === "Success" && data[0].PostOffice?.length > 0) {
            const po = data[0].PostOffice[0];
            document.getElementById("custCity").value = po.District || po.Block || "";
            if (!document.getElementById("custLocality").value) {
              document.getElementById("custLocality").value = po.Name || "";
            }
            const stateSelect = document.getElementById("custState");
            if (po.State && stateSelect) {
              const match = Array.from(stateSelect.options).find(o => o.value.toLowerCase() === po.State.toLowerCase());
              if (match) stateSelect.value = match.value;
            }
            // ESTIMATED DELIVERY DATE CALCULATION (3-5 Business Days)
            const deliveryDate = new Date();
            deliveryDate.setDate(deliveryDate.getDate() + 4);
            const dateFormatted = deliveryDate.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
            if (statusSpan) statusSpan.textContent = `✓ Est. Delivery: ${dateFormatted}`;
          } else {
            if (statusSpan) statusSpan.textContent = "";
          }
        } catch (err) {
          if (statusSpan) statusSpan.textContent = "";
        }
      } else {
        if (statusSpan) statusSpan.textContent = "";
      }
    });
  }

  document.querySelectorAll(".fk-type-pill").forEach(pill => {
    pill.addEventListener("click", (e) => {
      document.querySelectorAll(".fk-type-pill").forEach(b => b.classList.remove("active"));
      e.currentTarget.classList.add("active");
      document.getElementById("custAddrType").value = e.currentTarget.dataset.addrType;
    });
  });

  document.getElementById("closeLightboxBtn").addEventListener("click", () => {
    document.getElementById("lightboxModal").classList.add("hidden");
  });
  document.getElementById("zoomToggleBtn").addEventListener("click", () => {
    document.getElementById("lightboxImgContainer").classList.toggle("zoomed");
  });
  document.getElementById("lightboxMainImg").addEventListener("click", () => {
    document.getElementById("lightboxImgContainer").classList.toggle("zoomed");
  });
  document.getElementById("lbPrevBtn").addEventListener("click", () => {
    lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
    updateLightboxStage();
  });
  document.getElementById("lbNextBtn").addEventListener("click", () => {
    lightboxIndex = (lightboxIndex + 1) % lightboxImages.length;
    updateLightboxStage();
  });

  document.getElementById("closeReviewsBtn").addEventListener("click", () => {
    document.getElementById("reviewsModal").classList.add("hidden");
  });

  document.querySelectorAll("#starPicker button").forEach(starBtn => {
    starBtn.addEventListener("click", (e) => {
      selectedStarCount = Number(e.currentTarget.dataset.star);
      document.getElementById("selectedStarLabel").textContent = `${selectedStarCount} / 5 Stars`;
      document.querySelectorAll("#starPicker button").forEach(b => {
        b.classList.toggle("active", Number(b.dataset.star) <= selectedStarCount);
      });
    });
  });

  document.getElementById("reviewForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!activeReviewProductId) return;

    const name = document.getElementById("reviewerNameInput").value.trim() || "Customer";
    const comment = document.getElementById("reviewCommentInput").value.trim();
    if (!comment) return;

    if (!productReviews[activeReviewProductId]) productReviews[activeReviewProductId] = [];
    productReviews[activeReviewProductId].push({
      name,
      stars: selectedStarCount,
      comment,
      date: new Date().toLocaleDateString("en-IN", { month: "short", year: "numeric" })
    });

    safeSetStorage("lw_reviews", productReviews);
    document.getElementById("reviewCommentInput").value = "";
    renderReviewsModalContent();
    renderProducts();
    showToast("Thank you! Your review & rating updated this drop.");
  });

  document.getElementById("cancelReasonForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!pendingCancelOrderId) return;
    const reason = document.getElementById("cancelReasonInput").value.trim();

    try {
      const res = await fetch(`${API_BASE_URL}/admin/orders/${encodeURIComponent(pendingCancelOrderId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED", cancelReason: reason })
      });

      if (res.ok) {
        showToast("Order Cancelled & Reason Sent to Customer");
        document.getElementById("cancelReasonModal").classList.add("hidden");
        pendingCancelOrderId = null;
        fetchAdminOrders(true);
        if (currentUser) fetchMyOrders(currentUser.uid, false);
      } else {
        showToast("Failed to update order status");
      }
    } catch (err) {
      showToast("Network error updating order");
    }
  });

  document.getElementById("closeCancelModalBtn").addEventListener("click", () => {
    document.getElementById("cancelReasonModal").classList.add("hidden");
    pendingCancelOrderId = null;
  });

  document.getElementById("bagBtn").addEventListener("click", openBagDrawer);
  document.getElementById("closeBagBtn").addEventListener("click", () => {
    document.getElementById("bagModal").classList.add("hidden");
  });

  const openCustomerMenuDrawer = () => {
    document.getElementById("menuModal").classList.remove("hidden");
    if (currentUser) {
      fetchMyOrders(currentUser.uid, true);
    }
  };

  document.getElementById("menuBtn").addEventListener("click", openCustomerMenuDrawer);
  document.getElementById("userBtn").addEventListener("click", openCustomerMenuDrawer);
  document.getElementById("closeMenuBtn").addEventListener("click", () => {
    document.getElementById("menuModal").classList.add("hidden");
  });

  document.getElementById("refreshMyOrdersBtn").addEventListener("click", () => {
    if (currentUser) fetchMyOrders(currentUser.uid, true);
  });

  document.getElementById("adminHeaderBtn").addEventListener("click", openAdminModal);
  document.getElementById("openAdminFromMenuBtn").addEventListener("click", openAdminModal);
  document.getElementById("closeAdminBtn").addEventListener("click", () => {
    document.getElementById("adminModal").classList.add("hidden");
  });

  document.querySelectorAll(".admin-tab").forEach(tabBtn => {
    tabBtn.addEventListener("click", (e) => {
      document.querySelectorAll(".admin-tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".admin-tab-pane").forEach(p => p.classList.add("hidden"));
      e.currentTarget.classList.add("active");
      document.getElementById(e.currentTarget.dataset.tab).classList.remove("hidden");

      if (e.currentTarget.dataset.tab === "adminOrdersTab") {
        fetchAdminOrders(true);
      }
    });
  });

  document.getElementById("prodImageFiles").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const statusEl = document.getElementById("uploadStatusText");
    statusEl.textContent = `Uploading ${files.length} photo(s) to S3...`;

    for (const file of files) {
      try {
        const url = await compressAndUploadImage(file);
        if (url) uploadedProductImageUrls.push(url);
      } catch (err) {
        console.error(err);
        showToast(`Failed to upload ${file.name}`);
      }
    }
    renderUploadedPreviews();
  });

  document.getElementById("adminProductForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = document.getElementById("editProductId").value;
    const payload = {
      title: document.getElementById("prodTitle").value.trim(),
      sectionId: document.getElementById("prodSectionSelect").value,
      price: Number(document.getElementById("prodPrice").value),
      originalPrice: Number(document.getElementById("prodOriginalPrice").value) || null,
      images: uploadedProductImageUrls,
      sizes: {
        S: Number(document.getElementById("stockS").value) || 0,
        M: Number(document.getElementById("stockM").value) || 0,
        L: Number(document.getElementById("stockL").value) || 0,
        XL: Number(document.getElementById("stockXL").value) || 0,
        XXL: Number(document.getElementById("stockXXL").value) || 0
      },
      isLatest: document.getElementById("prodIsLatest").checked,
      isAvailable: document.getElementById("prodIsAvailable").checked
    };

    const url = editId
      ? `${API_BASE_URL}/admin/products/${encodeURIComponent(editId)}`
      : `${API_BASE_URL}/admin/products`;
    const method = editId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      showToast(editId ? "Product updated!" : "New product added!");
      document.getElementById("adminProductForm").reset();
      document.getElementById("editProductId").value = "";
      uploadedProductImageUrls = [];
      renderUploadedPreviews();
      document.getElementById("cancelEditProductBtn").classList.add("hidden");
      loadStoreCatalog();
    } else {
      showToast("Error saving product.");
    }
  });

  document.getElementById("cancelEditProductBtn").addEventListener("click", () => {
    document.getElementById("adminProductForm").reset();
    document.getElementById("editProductId").value = "";
    uploadedProductImageUrls = [];
    renderUploadedPreviews();
    document.getElementById("cancelEditProductBtn").classList.add("hidden");
  });

  document.getElementById("adminSectionForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      title: document.getElementById("secTitle").value.trim(),
      displayOrder: Number(document.getElementById("secOrder").value) || 1,
      description: document.getElementById("secDesc").value.trim()
    };
    const res = await fetch(`${API_BASE_URL}/admin/sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showToast("Section added!");
      document.getElementById("adminSectionForm").reset();
      loadStoreCatalog();
    }
  });

  document.getElementById("refreshAdminOrdersBtn").addEventListener("click", () => fetchAdminOrders(true));

  document.getElementById("googleSignInBtn").addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      showToast("Signed in with Google!");
    } catch (err) {
      showToast("Sign-in cancelled or blocked by popup blocker");
    }
  });

  document.getElementById("signOutBtn").addEventListener("click", async () => {
    await signOut(auth);
    showToast("Signed out");
  });

  document.getElementById("checkoutForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (shoppingBag.length === 0) {
      showToast("Your bag is empty!");
      return;
    }
    if (!currentUser) {
      showToast("Please sign in with Google to place your order.");
      document.getElementById("menuModal").classList.remove("hidden");
      return;
    }

    const name = document.getElementById("custName").value.trim();
    const phone = document.getElementById("custPhone").value.trim();
    const pincode = document.getElementById("custPincode").value.trim();
    const locality = document.getElementById("custLocality").value.trim();
    const house = document.getElementById("custHouse").value.trim();
    const city = document.getElementById("custCity").value.trim();
    const state = document.getElementById("custState").value;
    const landmark = document.getElementById("custLandmark").value.trim();
    const altPhone = document.getElementById("custAltPhone").value.trim();
    const addrType = document.getElementById("custAddrType").value || "Home";
    const paymentMethod = document.getElementById("custPaymentMethod").value || "COD";

    const addressDetails = { name, phone, pincode, locality, house, city, state, landmark, altPhone, addrType };
    safeSetStorage("lw_saved_address", addressDetails);

    const formattedAddress = `${house}, ${locality}${landmark ? ", Near " + landmark : ""}, ${city}, ${state} - ${pincode} (${addrType})`;

    const btn = document.getElementById("placeOrderBtn");
    btn.disabled = true;
    btn.textContent = "Placing Order...";

    const totalAmount = shoppingBag.reduce((sum, i) => sum + Number(i.price), 0);
    const payload = {
      userId: currentUser.uid,
      customerName: name,
      phone,
      address: formattedAddress,
      addressDetails,
      items: shoppingBag,
      totalAmount,
      paymentMethod,
      paymentStatus: paymentMethod === "COD" ? "PAY ON DELIVERY" : "UPI ON DELIVERY"
    };

    try {
      const res = await fetch(`${API_BASE_URL}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        shoppingBag = [];
        safeSetStorage("lw_bag", []);
        updateBagCounter();
        document.getElementById("bagModal").classList.add("hidden");
        showToast("Order Confirmed! Track live shipment in Track Orders.");
        fetchMyOrders(currentUser.uid, false);
        if (isAdminUser) checkAdminOrderNotifications();
      } else {
        showToast("Failed to place order. Please try again.");
      }
    } catch (err) {
      showToast("Network error while placing order.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Confirm & Place Order";
    }
  });
}

window.resetAllFilters = function () {
  document.getElementById("searchInput").value = "";
  document.getElementById("sortSelect").value = "newest";
  document.getElementById("categoryFilter").value = "all";
  document.getElementById("sizeFilter").value = "all";
  document.getElementById("ratingFilter").value = "0";
  document.getElementById("priceFilter").value = "all";
  renderProducts();
};

function showToast(msg) {
  const bar = document.getElementById("toastBar");
  bar.textContent = msg;
  bar.classList.remove("hidden");
  setTimeout(() => bar.classList.add("hidden"), 3200);
}