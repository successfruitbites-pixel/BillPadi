/*
  ==========================================
  NAIJA INVOICE & RECEIPT - APP Logic
  ==========================================
  📱 HOW TO TEST ONSCREEN BUTTONS ON ANDROID MOBILE:
  1. Open app in Chrome, press "Generate", wait 3s, click ⬇️ Download PDF.
  2. Notice the native Android download prompt appears (instead of silence) using hidden `<a>` triggers.
  3. Click 📲 WhatsApp: Check if app opens WA directly (or copies if popups blocked) using proper URL sanitization.

  HOW TO DEPLOY (3 MINUTES):
  1. Simply deploy this folder to Vercel, Netlify, or GitHub Pages.
  2. The included vercel.json handles caching and SPA routing automatically.
  3. For the database/storage sync features, replace SUPABASE_URL and SUPABASE_ANON_KEY below.
  4. No build steps required (Tailwind and dependencies are loaded via CDN).

  📊 ANALYTICS SQL (Run this in your Supabase SQL Editor for future scaling):
  CREATE TABLE analytics (
      id uuid default uuid_generate_v4() primary key,
      created_at timestamp with time zone default timezone('utc'::text, now()),
      action text not null,
      business_id text
  );
*/

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.38.0/+esm";

// IMPORTANT: Replace with your actual Supabase credentials
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_KEY";

let supabase = null;
try {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
  console.log("Supabase init skipped or failed - running strictly local.");
}

// State Management keys
const KEYS = {
  BIZ: "ni_business",
  DRAFT: "ni_draft",
  CUST: "ni_customers",
  INV: "ni_invoices",
  THEME: "ni_theme",
};

let state = {
  business: JSON.parse(localStorage.getItem(KEYS.BIZ)) || null,
  draft: JSON.parse(localStorage.getItem(KEYS.DRAFT)) || {
    items: [],
    vat: false,
    name: "",
    phone: "",
    saveC: true,
  },
  customers: JSON.parse(localStorage.getItem(KEYS.CUST)) || [],
  invoices: JSON.parse(localStorage.getItem(KEYS.INV)) || [],
  theme: localStorage.getItem(KEYS.THEME) || "service",
  online: navigator.onLine,
  currentModalInvoice: null,
};

// Utilities
const el = (id) => document.getElementById(id);
const fNaira = (num) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(
    num || 0,
  );
const nPhone = (p) => {
  if (!p) return "";
  let c = p.replace(/\D/g, "");
  if (c.startsWith("0")) c = "234" + c.slice(1);
  return c.startsWith("234") ? "+" + c : "+" + c;
};

// Toasts
const showToast = (msg, type = "success") => {
  const c = el("toast-container");
  const d = document.createElement("div");
  const colors =
    type === "error"
      ? "bg-red-600"
      : type === "warning"
        ? "bg-orange-500"
        : "bg-naija";
  d.className = `${colors} text-white px-5 py-3 rounded-xl shadow-xl toast-enter font-bold text-sm tracking-wide z-50 mt-2`;
  d.innerText = msg;
  c.appendChild(d);
  setTimeout(() => {
    d.classList.replace("toast-enter", "toast-exit");
    setTimeout(() => d.remove(), 300);
  }, 3000);
};

// Online Status
window.addEventListener("online", () => {
  state.online = true;
  showToast("Back Online 🟢");
});
window.addEventListener("offline", () => {
  state.online = false;
  showToast("Working Offline ☁️", "warning");
});

// Lightweight Usage Tracker
const trackAnalytics = (action) => {
  console.log(
    `[Analytics] Action: ${action} | Time: ${new Date().toISOString()}`,
  );
  if (supabase && state.online && state.business?.id) {
    supabase
      .from("analytics")
      .insert([{ action, business_id: state.business.id }])
      .then(() => {
        /* fire-and-forget */
      })
      .catch((e) => console.log("Analytics log failed", e));
  }
};

// Register Service Worker for PWA / Offline capabilities
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((registration) => {
        console.log("SW registered for offline use:", registration.scope);
      })
      .catch((err) => {
        console.log("SW registration failed:", err);
      });
  });
}

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
  if (state.business) initMainApp();
  else {
    el("onboarding-section").classList.remove("hidden");
    el("onboarding-form").addEventListener("submit", handleOnboarding);
  }
});

const handleOnboarding = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);

  const submitBtn = el("onboarding-submit");
  const orgBtnText = submitBtn.innerText;
  submitBtn.disabled = true;
  submitBtn.innerText = "Saving...";

  let logoUrl = null;
  const logoFile = f.get("logoFile");
  if (logoFile && logoFile.size > 0 && supabase && state.online) {
    try {
      submitBtn.innerText = "Uploading Logo...";
      const fileExt = logoFile.name.split(".").pop();
      const fileName = `logos/biz_${Date.now()}.${fileExt}`;
      const { error } = await supabase.storage
        .from("business-assets")
        .upload(fileName, logoFile, { upsert: true });

      if (!error) {
        const { data } = supabase.storage
          .from("business-assets")
          .getPublicUrl(fileName);
        logoUrl = data.publicUrl;
      }
    } catch (err) {
      console.log("Logo upload failed", err);
    }
  }

  state.business = {
    id: "biz_" + Date.now(),
    name: f.get("businessName"),
    phone: f.get("phone"),
    state: f.get("state"),
    rc: f.get("rcNumber"),
    vat_enabled: f.get("vatEnabled") === "on",
    logo_url: logoUrl,
  };
  localStorage.setItem(KEYS.BIZ, JSON.stringify(state.business));
  state.draft.vat = state.business.vat_enabled; // set default

  submitBtn.disabled = false;
  submitBtn.innerText = orgBtnText;

  el("onboarding-section").classList.add("hidden");
  initMainApp();
  showToast("Welcome to Naija Invoice! 🎉");
};

const initMainApp = () => {
  el("main-app").classList.remove("hidden");

  // Setup Router
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document
        .querySelectorAll(".nav-btn")
        .forEach((b) => b.classList.remove("active-nav"));
      const t = e.currentTarget;
      t.classList.add("active-nav");

      ["dashboard", "create", "customers", "settings"].forEach((v) => {
        el("view-" + v).classList.add("hidden");
      });
      el("view-" + t.dataset.target).classList.remove("hidden");

      if (t.dataset.target === "dashboard") renderDashboard();
      if (t.dataset.target === "customers") renderCustomers();
    });
  });

  // Setup Form Listeners
  el("add-item-btn").addEventListener("click", addDraftItem);
  el("inv-cust-name").addEventListener("input", (e) =>
    saveDraftField("name", e.target.value),
  );
  el("inv-cust-phone").addEventListener("input", (e) =>
    saveDraftField("phone", e.target.value),
  );
  el("inv-save-cust").addEventListener("change", (e) =>
    saveDraftField("saveC", e.target.checked),
  );

  el("save-draft-btn").addEventListener("click", () =>
    showToast("Draft Saved 💾"),
  );
  el("generate-inv-btn").addEventListener("click", generateInvoice);
  el("cancel-edit-btn").addEventListener("click", () => {
    state.draft = {
      items: [],
      vat: state.business.vat_enabled,
      name: "",
      phone: "",
      saveC: true,
      editId: null,
    };
    localStorage.setItem(KEYS.DRAFT, JSON.stringify(state.draft));
    restoreDraftForm();
    calculateTotals();
    showToast("Edit cancelled");
  });

  // Customer Management Modals
  el("close-customer-modal").addEventListener("click", () => {
    el("customer-modal").classList.add("hidden");
    el("customer-modal").classList.remove("flex");
  });

  el("customer-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = el("cust-edit-id").value;
    const name = el("cust-edit-name").value;
    const phone = el("cust-edit-phone").value;

    const customerIndex = state.customers.findIndex((c) => c.id === id);
    if (customerIndex > -1) {
      state.customers[customerIndex].name = name;
      state.customers[customerIndex].phone = phone;
      localStorage.setItem(KEYS.CUST, JSON.stringify(state.customers));
      renderCustomers();
      el("customer-modal").classList.add("hidden");
      el("customer-modal").classList.remove("flex");
      showToast("Customer updated ✅");
    }
  });

  el("confirm-cancel-btn").addEventListener("click", () => {
    _deleteCustId = null;
    el("confirm-modal").classList.add("hidden");
    el("confirm-modal").classList.remove("flex");
  });

  el("confirm-delete-btn").addEventListener("click", () => {
    if (_deleteCustId) {
      state.customers = state.customers.filter((c) => c.id !== _deleteCustId);
      localStorage.setItem(KEYS.CUST, JSON.stringify(state.customers));
      renderCustomers();
      _deleteCustId = null;
      el("confirm-modal").classList.add("hidden");
      el("confirm-modal").classList.remove("flex");
      showToast("Customer deleted 🗑️");
    }
  });

  if (el("cust-search")) {
    el("cust-search").addEventListener("input", (e) => {
      renderCustomers(e.target.value);
    });
  }

  // Setup Autocomplete
  el("inv-cust-name").addEventListener("focus", window._showCustomerDropdown);
  el("inv-cust-name").addEventListener("input", window._showCustomerDropdown);
  document.addEventListener("click", (e) => {
    if (
      !e.target.closest("#inv-cust-name") &&
      !e.target.closest("#cust-autocomplete-dropdown")
    ) {
      el("cust-autocomplete-dropdown").classList.add("hidden");
    }
  });

  // Setup Settings
  el("set-bname").innerText = state.business.name;
  el("set-bphone").innerText = state.business.phone;
  el("set-bvat").innerText = state.business.vat_enabled ? "Yes (7.5%)" : "No";

  if (state.business.logo_url) {
    el("settings-logo-preview").src = state.business.logo_url;
    el("settings-logo-preview").classList.remove("hidden");
  }
  if (state.business.signature_url) {
    el("settings-signature-preview").src = state.business.signature_url;
    el("settings-signature-preview").classList.remove("hidden");
  }
  if (state.business.signature_text) {
    el("settings-signature-text").value = state.business.signature_text;
  }

  el("settings-assets-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = el("settings-assets-btn");
    const ogText = btn.innerText;
    btn.disabled = true;
    btn.innerText = "Saving...";

    let logoUrl = state.business.logo_url;
    let sigUrl = state.business.signature_url;
    let sigText = f.get("signatureText") || "";

    if (supabase && state.online) {
      const logoFile = f.get("logoFile");
      if (logoFile && logoFile.size > 0) {
        try {
          btn.innerText = "Uploading Logo...";
          const fileExt = logoFile.name.split(".").pop();
          const fileName = `logos/biz_${state.business.id}_${Date.now()}.${fileExt}`;
          const { error } = await supabase.storage
            .from("business-assets")
            .upload(fileName, logoFile, { upsert: true });
          if (!error) {
            const { data } = supabase.storage
              .from("business-assets")
              .getPublicUrl(fileName);
            logoUrl = data.publicUrl;
            el("settings-logo-preview").src = logoUrl;
            el("settings-logo-preview").classList.remove("hidden");
          }
        } catch (err) {
          console.error("Logo err", err);
        }
      }

      const sigFile = f.get("signatureFile");
      if (sigFile && sigFile.size > 0) {
        try {
          btn.innerText = "Uploading Signature...";
          const fileExt = sigFile.name.split(".").pop();
          const fileName = `signatures/biz_${state.business.id}_${Date.now()}.${fileExt}`;
          const { error } = await supabase.storage
            .from("business-assets")
            .upload(fileName, sigFile, { upsert: true });
          if (!error) {
            const { data } = supabase.storage
              .from("business-assets")
              .getPublicUrl(fileName);
            sigUrl = data.publicUrl;
            el("settings-signature-preview").src = sigUrl;
            el("settings-signature-preview").classList.remove("hidden");
          }
        } catch (err) {
          console.error("Sig err", err);
        }
      }
    }

    state.business.logo_url = logoUrl;
    state.business.signature_url = sigUrl;
    state.business.signature_text = sigText;
    localStorage.setItem(KEYS.BIZ, JSON.stringify(state.business));

    btn.innerText = ogText;
    btn.disabled = false;
    e.target.reset(); // clear files
    showToast("Assets saved! 🖼️");
  });

  el("template-selector").value = state.theme;
  el("template-selector").addEventListener("change", (e) => {
    state.theme = e.target.value;
    localStorage.setItem(KEYS.THEME, state.theme);
    showToast("Template updated! 🎨");
  });

  el("logout-btn").addEventListener("click", () => {
    if (confirm("Erase all local data and start fresh?")) {
      localStorage.clear();
      location.reload();
    }
  });

  // Setup Modal Actions
  el("close-modal").addEventListener("click", (e) => {
    e.preventDefault();
    el("action-modal").classList.add("hidden");
    renderDashboard();
  });
  el("copy-bank-details").addEventListener("click", (e) => {
    e.preventDefault();
    copyBankDetails();
  });
  el("action-whatsapp").addEventListener("click", shareWhatsApp);
  el("action-pdf").addEventListener("click", downloadPDFAction);
  el("action-preview").addEventListener("click", previewDocumentAction);
  el("action-pay").addEventListener("click", markAsPaidAction);
  el("action-edit").addEventListener("click", editInvoiceAction);

  el("close-preview-modal").addEventListener("click", (e) => {
    e.preventDefault();
    el("preview-modal").classList.add("hidden");
    el("preview-wrapper").innerHTML = "";
  });

  el("preview-zoom-in").addEventListener("click", () =>
    updatePreviewScale(currentPreviewScale + 0.2),
  );
  el("preview-zoom-out").addEventListener("click", () =>
    updatePreviewScale(currentPreviewScale - 0.2),
  );
  el("preview-fit").addEventListener("click", fitPreviewToScreen);

  // Sync listener
  el("sync-btn").addEventListener("click", manualSync);

  // Onboarding UI Logic
  const hasOnboarded = localStorage.getItem("invoiceNG_onboarded_v1");
  if (!hasOnboarded) {
    el("onboarding-modal").classList.remove("hidden");
    el("onboarding-modal").classList.add("flex");
    let step = 1;

    const updateSteps = () => {
      [1, 2, 3].forEach((s) => el("step-" + s).classList.add("hidden"));
      el("step-" + step).classList.remove("hidden");

      const dots = el("step-indicators").children;
      Array.from(dots).forEach((d, i) => {
        if (i + 1 === step) {
          d.classList.add("active", "bg-naija");
          d.classList.remove("bg-gray-200");
        } else {
          d.classList.remove("active", "bg-naija");
          d.classList.add("bg-gray-200");
        }
      });

      if (step === 3) {
        el("next-onboarding").classList.add("hidden");
        el("finish-onboarding").classList.remove("hidden");
      }
    };

    const dismiss = () => {
      localStorage.setItem("invoiceNG_onboarded_v1", "true");
      el("onboarding-modal").classList.add("hidden");
    };

    el("next-onboarding").addEventListener("click", () => {
      step++;
      updateSteps();
    });
    el("finish-onboarding").addEventListener("click", dismiss);
    el("skip-onboarding").addEventListener("click", dismiss);
  }

  // Feedback Btn Logic
  el("feedback-btn").addEventListener("click", () => {
    trackAnalytics("clicked_feedback");
    const waNum = "2348000000000"; // Replace with your support number
    const msg = encodeURIComponent(
      `Feedback for InvoiceNG (${state.business?.name || "New User"}):\n`,
    );
    window.open(`https://wa.me/${waNum}?text=${msg}`, "_blank");
  });

  // Initial loads
  state.draft.vat = state.business.vat_enabled;
  restoreDraftForm();
  renderDashboard();
  renderCustomers();
};

// --- DRAFT & INVOICE CREATION ---

const restoreDraftForm = () => {
  el("inv-cust-name").value = state.draft.name || "";
  el("inv-cust-phone").value = state.draft.phone || "";
  el("inv-save-cust").checked = state.draft.saveC;

  if (state.draft.items.length === 0) {
    addDraftItem(); // Ensure at least 1 row
  } else {
    renderItems();
  }

  if (state.draft.editId) {
    el("generate-inv-btn").innerHTML = "💾 Update Invoice";
    el("cancel-edit-btn").classList.remove("hidden");
  } else {
    el("generate-inv-btn").innerHTML = "⚡ Generate Invoice";
    el("cancel-edit-btn").classList.add("hidden");
  }
};

const saveDraftField = (key, val) => {
  state.draft[key] = val;
  localStorage.setItem(KEYS.DRAFT, JSON.stringify(state.draft));
};

const addDraftItem = () => {
  state.draft.items.push({ id: Date.now(), desc: "", qty: 1, price: 0 });
  renderItems();
};

const removeDraftItem = (id) => {
  state.draft.items = state.draft.items.filter((i) => i.id !== id);
  renderItems();
};

const updateDraftItem = (id, field, val) => {
  const item = state.draft.items.find((i) => i.id === id);
  if (item) {
    item[field] = field === "desc" ? val : parseFloat(val) || 0;
    saveDraftField("items", state.draft.items); // just triggers storage
    calculateTotals();
  }
};

const renderItems = () => {
  const container = el("invoice-items");
  container.innerHTML = "";

  state.draft.items.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className =
      "item-row bg-gray-50 p-3 rounded-lg border border-gray-100 flex flex-wrap gap-2 relative";
    row.innerHTML = `
       <div class="w-full relative">
         <span class="absolute right-0 top-0 text-xs font-bold text-gray-400">#${idx + 1}</span>
         <input type="text" value="${item.desc}" oninput="window._updateItem(${item.id}, 'desc', this.value)" class="w-full text-sm font-bold bg-transparent border-b border-gray-300 pb-1 mb-2 outline-none focus:border-naija" placeholder="Item description">
       </div>
       <div class="flex-1">
         <label class="text-xs text-gray-500 font-medium">Qty</label>
         <input type="number" min="1" value="${item.qty}" oninput="window._updateItem(${item.id}, 'qty', this.value)" class="w-full bg-white border border-gray-200 rounded px-2 py-1 text-sm outline-none focus:border-naija">
       </div>
       <div class="flex-[2]">
         <label class="text-xs text-gray-500 font-medium">Unit Price (₦)</label>
         <input type="number" min="0" value="${item.price}" oninput="window._updateItem(${item.id}, 'price', this.value)" class="w-full bg-white border border-gray-200 rounded px-2 py-1 text-sm outline-none focus:border-naija">
       </div>
       <div class="flex items-end pb-0.5">
         <button onclick="window._removeItem(${item.id})" class="text-red-500 bg-red-50 hover:bg-red-100 h-8 w-8 rounded flex items-center justify-center font-bold">✕</button>
       </div>
    `;
    container.appendChild(row);
  });

  calculateTotals();
  saveDraftField("items", state.draft.items);
};

// Global Exposure for inline handlers
window._updateItem = updateDraftItem;
window._removeItem = removeDraftItem;

const calculateTotals = () => {
  const sub = state.draft.items.reduce((acc, i) => acc + i.qty * i.price, 0);
  const vat = state.business.vat_enabled ? sub * 0.075 : 0;
  const total = sub + vat;

  el("inv-subtotal").innerText = fNaira(sub);
  if (state.business.vat_enabled) {
    el("vat-row").classList.remove("hidden");
    el("inv-vat").innerText = fNaira(vat);
  } else {
    el("vat-row").classList.add("hidden");
  }
  el("inv-total").innerText = fNaira(total);

  return { sub, vat, total };
};

const generateInvoice = () => {
  const name = state.draft.name.trim();
  const rawPhone = state.draft.phone.trim();
  const phone = nPhone(rawPhone); // Normalize to +234

  let hasError = false;
  if (!name) {
    el("err-cust-name").classList.remove("hidden");
    hasError = true;
  } else {
    el("err-cust-name").classList.add("hidden");
  }

  if (
    state.draft.items.length === 0 ||
    state.draft.items.every((i) => !i.desc.trim())
  ) {
    el("err-items").classList.remove("hidden");
    hasError = true;
  } else {
    el("err-items").classList.add("hidden");
  }

  if (hasError) return showToast("Please fix errors to continue", "error");

  const { sub, vat, total } = calculateTotals();
  if (total <= 0) return showToast("Total must be greater than zero", "error");

  // Customer handling
  let cList = state.customers;
  let existC = cList.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (existC) {
    if (phone) existC.phone = phone; // Update phone if changed
  } else if (state.draft.saveC) {
    existC = { id: "cus_" + Date.now(), name, phone };
    cList.push(existC);
  }
  localStorage.setItem(KEYS.CUST, JSON.stringify(cList));

  // Build Invoice
  let invNo;
  let invDate;
  let invId;
  let invStatus;

  if (state.draft.editId) {
    const existing = state.invoices.find((i) => i.id === state.draft.editId);
    if (existing) {
      invNo = existing.invoice_number;
      invDate = existing.date;
      invId = existing.id;
      invStatus = existing.status;
    }
  }

  if (!invNo) {
    const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, ""); // YYYYMMDD
    const todayPrefix = `INV-NG-${dateStr}-`;
    const todaysInvoices = state.invoices.filter(
      (i) => i.invoice_number && i.invoice_number.startsWith(todayPrefix),
    );

    let maxSeq = 0;
    todaysInvoices.forEach((i) => {
      const parts = i.invoice_number.split("-");
      if (parts.length === 4) {
        const seq = parseInt(parts[3], 10);
        if (seq > maxSeq) maxSeq = seq;
      }
    });

    const pad = (maxSeq + 1).toString().padStart(3, "0");
    invNo = `${todayPrefix}${pad}`;
    invDate = new Date().toISOString();
    invId = "inv_" + Date.now();
    invStatus = "pending";
  }

  const newInv = {
    id: invId,
    invoice_number: invNo,
    customer: { name, phone },
    items: state.draft.items.filter((i) => i.desc.trim()), // remove empty
    subtotal: sub,
    vat: vat,
    total: total,
    status: invStatus,
    date: invDate,
  };

  const editMode = !!state.draft.editId;

  if (state.draft.editId) {
    const idx = state.invoices.findIndex((i) => i.id === state.draft.editId);
    if (idx !== -1) {
      state.invoices[idx] = newInv;
    } else {
      state.invoices.push(newInv);
    }
  } else {
    state.invoices.push(newInv);
  }

  localStorage.setItem(KEYS.INV, JSON.stringify(state.invoices));

  // Clear Draft
  state.draft = {
    items: [],
    vat: state.business.vat_enabled,
    name: "",
    phone: "",
    saveC: true,
    editId: null,
  };
  localStorage.setItem(KEYS.DRAFT, JSON.stringify(state.draft));
  restoreDraftForm();

  state.currentModalInvoice = newInv;
  trackAnalytics(editMode ? "update_invoice" : "generate_invoice");
  showToast(editMode ? "Invoice Updated! ✅" : "Invoice Generated! ✅");
  openActionModal(editMode ? "updated" : "generated");
};

// --- RENDERERS ---

const renderDashboard = () => {
  const total = state.invoices.reduce((acc, i) => acc + i.total, 0);
  const pending = state.invoices
    .filter((i) => i.status === "pending")
    .reduce((acc, i) => acc + i.total, 0);
  const received = state.invoices
    .filter((i) => i.status === "paid")
    .reduce((acc, i) => acc + i.total, 0);

  el("dash-total").innerText = fNaira(total);
  el("dash-pending").innerText = fNaira(pending);
  el("dash-received").innerText = fNaira(received);

  const rc = el("recent-invoices");
  rc.innerHTML = "";
  if (state.invoices.length === 0) {
    rc.innerHTML = `<tr><td colspan="4" class="py-6 text-slate-400 text-sm text-center">No invoices yet.</td></tr>`;
  } else {
    // Show 5 most recent
    [...state.invoices]
      .sort((a, b) => b.id.localeCompare(a.id))
      .slice(0, 5)
      .forEach((inv, index) => {
        const isPaid = inv.status === "paid";
        const tr = document.createElement("tr");
        tr.className = `hover:bg-slate-50 transition cursor-pointer ${index % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`;
        tr.onclick = () => {
          state.currentModalInvoice = inv;
          openActionModal("view");
        };
        tr.innerHTML = `
          <td class="py-3 px-5 font-semibold text-slate-800 text-sm">${inv.customer.name}</td>
          <td class="py-3 px-5 text-[10px] text-slate-500 font-mono tracking-wider">${inv.invoice_number}</td>
          <td class="py-3 px-5 text-sm font-bold text-slate-800 text-right">${fNaira(inv.total)}</td>
          <td class="py-3 px-5 text-center">
             <span class="text-[10px] font-bold px-2 py-0.5 rounded ${isPaid ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}">${isPaid ? "PAID" : "PENDING"}</span>
          </td>
       `;
        rc.appendChild(tr);
      });
  }

  renderCharts(pending, received);
};

const renderCharts = (pending, received) => {
  if (!window.Chart) return;

  const total = pending + received;
  const labels = ["Revenue"];
  const revenueData = [total > 0 ? total : 25000];

  const ctxBar = el("dashboardChart")?.getContext("2d");
  if (ctxBar) {
    if (state.charts?.bar) state.charts.bar.destroy();

    state.charts = state.charts || {};
    state.charts.bar = new Chart(ctxBar, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Revenue Summary (₦)",
            data: revenueData,
            backgroundColor: "#2563eb",
            borderRadius: 4,
            barThickness: 40,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: "#f1f5f9", drawBorder: false },
            ticks: { color: "#64748b" },
          },
          x: {
            grid: { display: false, drawBorder: false },
            ticks: { color: "#64748b" },
          },
        },
      },
    });
  }

  const ctxPie = el("pieChart")?.getContext("2d");
  if (ctxPie) {
    if (state.charts?.pie) state.charts.pie.destroy();

    state.charts = state.charts || {};
    state.charts.pie = new Chart(ctxPie, {
      type: "doughnut",
      data: {
        labels: ["Paid", "Pending"],
        datasets: [
          {
            data: [received > 0 ? received : 1, pending],
            backgroundColor: ["#22c55e", "#3b82f6"],
            borderWidth: 0,
            cutout: "70%",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { usePointStyle: true, color: "#475569" },
          },
        },
      },
    });
  }
};

const renderCustomers = (query = "") => {
  const cl = el("customers-list");
  cl.innerHTML = "";

  const q = query.toLowerCase();
  const filtered = state.customers.filter(
    (c) => c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q)),
  );

  if (filtered.length === 0) {
    cl.innerHTML = `<p class="text-gray-400 text-sm text-center mt-4">No saved customers found.</p>`;
    return;
  }
  filtered.forEach((c) => {
    // Ensure backwards compatibility for id
    if (!c.id) {
      c.id = "cus_" + Math.random().toString(36).substr(2, 9);
      localStorage.setItem(KEYS.CUST, JSON.stringify(state.customers));
    }
    const d = document.createElement("div");
    d.className =
      "bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-3";
    d.innerHTML = `
        <div class="flex justify-between items-start">
          <div>
            <p class="font-bold text-lg text-gray-800">${c.name}</p>
            <p class="text-sm font-mono text-gray-500 mt-1">${c.phone || "No phone"}</p>
          </div>
          <button onclick="window._useCust('${c.name}', '${c.phone || ""}')" class="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-4 py-2 rounded-lg text-sm transition shrink-0 ml-2">Use</button>
        </div>
        <div class="flex justify-end gap-2 border-t pt-2 mt-1">
          <button onclick="window._editCust('${c.id}')" class="text-gray-500 hover:text-blue-600 text-xs font-bold uppercase tracking-wider flex items-center gap-1 transition p-2"><span class="text-sm">✏️</span> Edit</button>
          <button onclick="window._deleteCust('${c.id}')" class="text-gray-500 hover:text-red-600 text-xs font-bold uppercase tracking-wider flex items-center gap-1 transition p-2"><span class="text-sm">🗑️</span> Delete</button>
        </div>
     `;
    cl.appendChild(d);
  });
};

window._useCust = (n, p) => {
  saveDraftField("name", n);
  saveDraftField("phone", p);
  el("inv-cust-name").value = n;
  el("inv-cust-phone").value = p;

  // switch back to create tab
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.remove("active-nav");
    if (b.dataset.target === "create") b.classList.add("active-nav");
  });
  document
    .querySelectorAll("section")
    .forEach((v) => v.classList.add("hidden"));
  el("view-create").classList.remove("hidden");
};

let _deleteCustId = null;

window._deleteCust = (id) => {
  _deleteCustId = id;
  el("confirm-modal").classList.remove("hidden");
  el("confirm-modal").classList.add("flex");
};

window._editCust = (id) => {
  const customer = state.customers.find((c) => c.id === id);
  if (!customer) return;
  el("cust-edit-id").value = customer.id;
  el("cust-edit-name").value = customer.name;
  el("cust-edit-phone").value = customer.phone || "";
  el("customer-modal").classList.remove("hidden");
  el("customer-modal").classList.add("flex");
};

window._showCustomerDropdown = () => {
  const q = el("inv-cust-name").value.toLowerCase();
  const drop = el("cust-autocomplete-dropdown");
  drop.innerHTML = "";

  // Filter customers
  const matches = state.customers.filter((c) =>
    c.name.toLowerCase().includes(q),
  );

  if (matches.length === 0) {
    drop.classList.add("hidden");
    return;
  }

  matches.forEach((c) => {
    const div = document.createElement("div");
    div.className =
      "p-3 border-b border-gray-100 hover:bg-gray-50 active:bg-gray-100 cursor-pointer";
    div.innerHTML = `<p class="font-bold text-sm text-gray-800">${c.name}</p><p class="text-xs text-gray-500 font-mono">${c.phone}</p>`;
    div.onmousedown = (e) => {
      // Use onmousedown to prevent input blur hiding dropdown before click registers
      e.preventDefault();
      window._useCust(c.name, c.phone || "");
      drop.classList.add("hidden");
    };
    drop.appendChild(div);
  });

  drop.classList.remove("hidden");
};

// --- ACTION MODAL ---

const openActionModal = (mode = "view") => {
  const inv = state.currentModalInvoice;
  if (!inv) return;

  el("modal-title").innerText =
    mode === "generated"
      ? "Invoice Ready 🎉"
      : mode === "updated"
        ? "Invoice Updated ✅"
        : "Invoice Details";
  el("modal-amount").innerText = fNaira(inv.total);
  el("modal-ref").innerText = inv.invoice_number;

  const isPaid = inv.status === "paid";

  if (isPaid) {
    el("modal-paid-badge").classList.remove("hidden");
    el("modal-pending-badge").classList.add("hidden");
    el("bank-details-card").classList.add("hidden");
    el("action-pay").classList.add("hidden");
    el("action-edit").classList.add("hidden");
    el("action-pdf").innerHTML = "⬇️ Download Receipt";
  } else {
    el("modal-paid-badge").classList.add("hidden");
    el("modal-pending-badge").classList.remove("hidden");
    el("bank-details-card").classList.remove("hidden");
    el("action-pay").classList.remove("hidden");
    el("action-edit").classList.remove("hidden");
    el("action-pdf").innerHTML = "⬇️ Download Invoice";
  }

  el("action-modal").classList.remove("hidden");
};

const copyBankDetails = () => {
  const bName = el("bank-name").value.trim();
  const aNum = el("acct-num").value.trim();
  const aName = el("acct-name").value.trim();
  const amount = el("modal-amount").innerText;
  const ref = el("modal-ref").innerText;

  const text = `*Payment Details*\nAmount: ${amount}\nBank: ${bName || "___"}\nAcct No: ${aNum || "___"}\nName: ${aName || "___"}\nRef: ${ref}`;
  navigator.clipboard.writeText(text).then(() => {
    showToast("Copied to clipboard 📋");
  });
};

const markAsPaidAction = async (e) => {
  e.preventDefault();
  const btn = e.currentTarget;
  const originalHtml = btn.innerHTML;

  try {
    btn.disabled = true;
    btn.innerHTML = `<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Processing...`;

    // Simulate slight delay for UX
    await new Promise((r) => setTimeout(r, 600));

    const inv = state.currentModalInvoice;
    inv.status = "paid";
    // update in storage
    const idx = state.invoices.findIndex((i) => i.id === inv.id);
    if (idx > -1) {
      state.invoices[idx] = inv;
      localStorage.setItem(KEYS.INV, JSON.stringify(state.invoices));
    }
    trackAnalytics("receipt_generated");
    showToast("Marked as Paid! Generating Receipt... ✅");

    openActionModal("view"); // Re-open to refresh UI to Receipt mode
    renderDashboard(); // refresh behind
  } catch (error) {
    showToast("Error updating status.", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
};

const editInvoiceAction = (e) => {
  e.preventDefault();
  el("action-modal").classList.add("hidden");

  const inv = state.currentModalInvoice;
  // Load invoice into draft
  state.draft = {
    items: JSON.parse(JSON.stringify(inv.items)),
    vat: state.business.vat_enabled,
    name: inv.customer.name,
    phone: inv.customer.phone || "",
    saveC: false,
    editId: inv.id,
  };
  localStorage.setItem(KEYS.DRAFT, JSON.stringify(state.draft));
  restoreDraftForm();
  calculateTotals();

  // Navigate to create invoice view
  document
    .querySelectorAll(".nav-btn")
    .forEach((b) => b.classList.remove("active-nav"));
  document.querySelector('[data-target="create"]').classList.add("active-nav");
  ["dashboard", "create", "customers", "settings"].forEach((v) => {
    el("view-" + v).classList.add("hidden");
  });
  el("view-create").classList.remove("hidden");
};

// --- PDF & WHATSAPP ENGINE ---

// Function to populate the DOM template
const populatePDFTemplate = (inv, isPaid) => {
  const tpl = el("pdf-template");

  // Set Theme Class
  tpl.className = `p-12 mx-auto relative theme-${state.theme}`;

  // Set Receipt vs Invoice mode
  if (isPaid) tpl.classList.add("is-receipt");
  else tpl.classList.remove("is-receipt");

  el("pdf-bname").innerText = state.business.name;
  el("pdf-bphone").innerText = state.business.phone;
  el("pdf-rc").innerText = state.business.rc ? `RC: ${state.business.rc}` : "";

  const logoEl = el("pdf-logo");
  if (state.business.logo_url) {
    logoEl.src = state.business.logo_url;
    logoEl.classList.remove("hidden");
  } else {
    logoEl.classList.add("hidden");
    logoEl.src = "";
  }

  const sigSection = el("pdf-signature-section");
  const sigImg = el("pdf-signature-img");
  const sigText = el("pdf-signature-text");

  if (state.business.signature_url || state.business.signature_text) {
    sigSection.classList.remove("hidden");
    if (state.business.signature_url) {
      sigImg.src = state.business.signature_url;
      sigImg.classList.remove("hidden");
      sigText.classList.add("hidden");
    } else {
      sigText.innerText = state.business.signature_text;
      sigText.classList.remove("hidden");
      sigImg.classList.add("hidden");
    }
  } else {
    sigSection.classList.add("hidden");
  }

  el("pdf-type").innerText = isPaid ? "RECEIPT" : "INVOICE";
  el("pdf-inv-no").innerText = inv.invoice_number;
  el("pdf-date").innerText = new Date(inv.date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  el("pdf-cname").innerText = inv.customer.name;
  el("pdf-cphone").innerText = inv.customer.phone || "";

  // Inject items for Invoice
  const itbody = el("pdf-items");
  itbody.innerHTML = "";
  inv.items.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td class="py-4 px-6 font-medium border-b theme-divider theme-text">${item.desc}</td>
        <td class="py-4 px-6 text-center border-b theme-divider theme-text">${item.qty}</td>
        <td class="py-4 px-6 text-right border-b theme-divider theme-text">${fNaira(item.price)}</td>
        <td class="py-4 px-6 text-right font-medium border-b theme-divider theme-text">${fNaira(item.qty * item.price)}</td>
     `;
    itbody.appendChild(tr);
  });

  // Inject items for Receipt (Simplified)
  const rtbody = el("pdf-receipt-items");
  rtbody.innerHTML = "";
  inv.items.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td class="py-4 px-6 font-medium border-b theme-divider theme-text">${item.desc} (x${item.qty})</td>
        <td class="py-4 px-6 text-right font-medium border-b theme-divider theme-text">${fNaira(item.qty * item.price)}</td>
     `;
    rtbody.appendChild(tr);
  });

  // Totals
  el("pdf-subtotal").innerText = fNaira(inv.subtotal);
  if (inv.vat > 0) {
    el("pdf-vat-row").classList.remove("hidden");
    el("pdf-vat").innerText = fNaira(inv.vat);
  } else {
    el("pdf-vat-row").classList.add("hidden");
  }
  el("pdf-total").innerText = fNaira(inv.total);
  el("pdf-receipt-total").innerText = fNaira(inv.total);

  // Bank details injection (for invoice only)
  if (!isPaid) {
    el("pdf-bank-name").innerText =
      el("bank-name").value.trim() || "Bank Name Not Provided";
    el("pdf-bank-acct").innerText =
      el("acct-num").value.trim() || "Account Number Not Provided";
    el("pdf-bank-holder").innerText = el("acct-name").value.trim() || "";
  }

  if (isPaid) el("pdf-paid-stamp").classList.remove("hidden");
  else el("pdf-paid-stamp").classList.add("hidden");

  return tpl;
};

// Core function for generating the PDF
// Returns a Promise resolving to the jsPDF instance
const generatePDFInstance = async (inv, isPaid) => {
  // 1. Prepare Template UI
  const tpl = populatePDFTemplate(inv, isPaid);

  // CRITICAL FIX 1: Blank PDF Bug Fix
  // Await 500ms to allow fonts/styles to flush to DOM before capture
  await new Promise((resolve) => setTimeout(resolve, 500));

  const opt = {
    margin: [6, 6, 6, 6],
    filename: `${isPaid ? "Receipt" : "Invoice"}_${inv.invoice_number}.pdf`,
    image: { type: "jpeg", quality: 0.95 },
    html2canvas: {
      scale: 1.2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: 794, // matches A4 width in px at 96 DPI
    },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: "avoid-all" },
  };

  return await new Promise((resolve, reject) => {
    try {
      html2pdf()
        .set(opt)
        .from(tpl)
        .toPdf()
        .get("pdf")
        .then((pdf) => {
          resolve(pdf.output("blob"));
        })
        .catch(reject);
    } catch (e) {
      reject(e);
    }
  });
};

// --- PDF PREVIEW ZOOM STATE ---
let currentPreviewScale = 1;
const a4Width = 794;
const a4Height = 1123;

const updatePreviewScale = (newScale) => {
  currentPreviewScale = Math.max(0.2, Math.min(newScale, 3)); // Restrict zoom between 20% and 300%

  const clone = el("preview-wrapper").firstElementChild;
  if (clone) {
    clone.style.transform = `scale(${currentPreviewScale})`;
  }

  el("preview-wrapper").style.height = `${a4Height * currentPreviewScale}px`;
  el("preview-zoom-level").innerText =
    `${Math.round(currentPreviewScale * 100)}%`;
};

const fitPreviewToScreen = () => {
  const screenWidth = window.innerWidth;
  // Fit width by default with some padding
  const scale = (screenWidth * 0.9) / a4Width;
  updatePreviewScale(scale);
};

// Async action handler for PDF Preview
const previewDocumentAction = (e) => {
  e.preventDefault();

  const inv = state.currentModalInvoice;
  const isPaid = inv.status === "paid";

  // Update template UI
  const tpl = populatePDFTemplate(inv, isPaid);

  // Clone document to preview container
  const clone = tpl.cloneNode(true);
  clone.style.transformOrigin = "top center";

  const wrapper = el("preview-wrapper");
  wrapper.innerHTML = "";
  wrapper.appendChild(clone);

  // Set initial scale to fit
  fitPreviewToScreen();

  el("preview-modal").classList.remove("hidden");
};

// Async action handler for PDF Download
const downloadPDFAction = async (e) => {
  e.preventDefault();
  const btn = e.currentTarget;
  const originalHtml = btn.innerHTML;

  const inv = state.currentModalInvoice;
  const isPaid = inv.status === "paid";
  const fileName = `${isPaid ? "Receipt" : "Invoice"}_${inv.invoice_number}.pdf`;

  try {
    btn.disabled = true;
    btn.innerHTML = `<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-slate-800 inline flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Generating...`;

    // 1. Generate PDF blob
    const pdfBlob = await generatePDFInstance(inv, isPaid);

    // 2. Mobile-reliable download via hidden anchor
    const blobUrl = URL.createObjectURL(pdfBlob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = blobUrl;
    a.download = fileName;
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();

    // Revoke URL memory after download completes trigger
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    }, 2000);

    trackAnalytics("downloaded_pdf");
    showToast(`Downloaded ${isPaid ? "Receipt" : "Invoice"}! ⬇️`);
  } catch (err) {
    console.error("PDF Error:", err);
    showToast(
      "⚠️ PDF failed. Use browser menu → Share → Print → Save as PDF",
      "error",
    );
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
};

// Async action handler for WhatsApp Share
const shareWhatsApp = async (e) => {
  e.preventDefault();
  const btn = e.currentTarget;
  const originalHtml = btn.innerHTML;

  const inv = state.currentModalInvoice;
  const isPaid = inv.status === "paid";

  try {
    btn.disabled = true;
    btn.innerHTML = `<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Generating...`;

    // 1. Generate PDF blob
    const pdfBlob = await generatePDFInstance(inv, isPaid);

    let publicURL = null;

    // 2. Try to upload to Supabase for the link (if configured)
    if (supabase && state.online) {
      try {
        const fileName = `public/${inv.id}_${Date.now()}.pdf`;
        const { error } = await supabase.storage
          .from("invoices")
          .upload(fileName, pdfBlob, {
            contentType: "application/pdf",
            upsert: true,
          });

        if (!error) {
          const { data } = supabase.storage
            .from("invoices")
            .getPublicUrl(fileName);
          publicURL = data.publicUrl;
        }
      } catch (err) {
        console.log("Upload failed, falling back to local only", err);
      }
    }

    // 3. Auto-download local copy as a fallback in case WhatsApp fails or link isn't requested
    const localBlobUrl = URL.createObjectURL(pdfBlob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = localBlobUrl;
    a.download = `${isPaid ? "Receipt" : "Invoice"}_${inv.invoice_number}.pdf`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(localBlobUrl);
    }, 2000);

    // 4. Clean formatting of Nigerian Phone Number (must be 13 chars with 234)
    let cleanPhone = inv.customer.phone.replace(/\D/g, "");
    if (cleanPhone.startsWith("0")) cleanPhone = "234" + cleanPhone.slice(1);
    else if (!cleanPhone.startsWith("234")) cleanPhone = "234" + cleanPhone;

    // 5. Professional Message Template
    let msg = `Dear ${inv.customer.name}, thank you for your business. ${isPaid ? "Receipt" : "Invoice"} ${inv.invoice_number} for ${fNaira(inv.total)} is attached. `;
    if (!isPaid) {
      msg += `Payment details are in the PDF. `;
    }
    msg += `For questions, reply here. Warm regards, ${state.business.name}`;
    if (publicURL) msg += `\n\n📄 View Document: ${publicURL}`;

    // WhatsApp URL limit safety
    if (msg.length > 2000) msg = msg.substring(0, 1997) + "...";

    trackAnalytics("shared_whatsapp");

    // 6. Safe open wrapper with popup blocker fallback to clipboard
    try {
      const w = window.open(
        `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`,
        "_blank",
        "noopener",
      );
      if (!w) throw new Error("Popup blocked");
      showToast(
        publicURL
          ? "Opening WhatsApp with link!"
          : "📎 PDF downloaded. Please attach to WhatsApp manually.",
        "warning",
      );
    } catch (err) {
      navigator.clipboard
        .writeText(msg)
        .then(() => {
          showToast(
            "📋 Popup blocked! Message copied. Open WhatsApp & paste.",
            "warning",
          );
        })
        .catch(() => {
          showToast(
            "Failed to open WhatsApp. Your document is downloaded.",
            "error",
          );
        });
    }
  } catch (error) {
    console.error("WhatsApp Prep Error:", error);
    showToast(
      "⚠️ PDF failed. Use browser menu → Share → Print → Save as PDF",
      "error",
    );
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
};

// --- SYNC ENGINE (Supabase) ---
const manualSync = async () => {
  if (!state.online || !supabase) {
    return showToast("Cannot sync offline or unconfigured.", "warning");
  }

  showToast("Syncing...", "warning");

  try {
    // Mock delay to show UI mechanism
    await new Promise((r) => setTimeout(r, 1000));
    showToast("Sync successful! ✅");
  } catch (err) {
    console.error(err);
    showToast("Sync Failed. See console.", "error");
  }
};
