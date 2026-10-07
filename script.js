
 const SUPABASE_URL = "https://ruuzjvonjfmamevmgsok.supabase.co"; // from Settings > General
const SUPABASE_KEY = "sb_publishable_UMuFCkemafWzwxf9ZyHkXQ_Foi6eypV"; // from Settings > API Keys
const sb = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

async function loadCarparts() {
  const catalog = document.getElementById('catalog');
  if (!catalog) return;

  if (!sb) {
    catalog.textContent = 'The product catalog is temporarily unavailable.';
    console.error('Supabase client is unavailable.');
    return
  }

  try {
    const { data, error } = await sb
      .from('carparts')
      .select('*');

    if (error) throw error;

    renderCarparts(data || []);
    renderFilters(data || []);
  } catch (error) {
    console.error('Unable to load car parts:', error);
    catalog.textContent = 'Unable to load products. Please try again later.';
  }
}

function renderFilters(parts) {
  console.log('renderFilters called with', parts.length, 'parts')
  const filterBar = document.getElementById('filterBar')
 if (!filterBar) return;

  filterBar.addEventListener('click', (e) => {
  if (!e.target.classList.contains('filter-btn')) return

  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'))
  e.target.classList.add('active')

  const selected = e.target.dataset.category
  console.log('clicked category:', selected)

  const filtered = selected === 'all' ? parts : parts.filter(p => p.category === selected)
  console.log('filtered results:', filtered.length, filtered)

  renderCarparts(filtered)
})
  const categories = [...new Set(parts.map(p => p.category).filter(Boolean))]
  console.log('categories found:', categories)

console.log("raw categories:", JSON.stringify(parts.map(p => p.category)))
  categories.forEach(category => {
    const btn = document.createElement('button')
    btn.className = 'filter-btn'
    btn.textContent = category
    btn.dataset.category = category
    filterBar.appendChild(btn)
  })
}

function renderCarparts(parts) {
  const catalog = document.getElementById('catalog');
  if (!catalog) return;
  catalog.innerHTML = ''; // Clear existing content

  parts.forEach(part => {
    const card = document.createElement('div');
    card.className = 'part-card';

    card.innerHTML = `
      <img src="${escapeHtml(part.image_url || '')}" alt="${escapeHtml(part.name || '')}">
      <h3>${escapeHtml(part.name || 'Unnamed')}</h3>
      <p>${escapeHtml(part.description || 'No description available')}</p>
      
    `;
    const image = card.querySelector('img');
    image.addEventListener('error', () => {
      card.classList.add('image-unavailable');
      image.remove();
    }, { once: true });
    catalog.appendChild(card);
  });
}

loadCarparts()

document.addEventListener('DOMContentLoaded', function() {
  // Initialize CSRF token
  initCSRFToken();
  
  // Get contact form if it exists
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', handleFormSubmit);
    
    // Real-time validation
    document.getElementById('name').addEventListener('blur', validateName);
    document.getElementById('email').addEventListener('blur', validateEmail);
    document.getElementById('message').addEventListener('blur', validateMessage);
  }
  
  // Search functionality with input sanitization
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', handleSearch);
  }
});

/**
 * Initialize CSRF Token
 * In production, this should come from your backend
 */
function initCSRFToken() {
  const csrfField = document.getElementById('csrf_token');
  if (csrfField) {
    // Generate a simple token (in production, get from server)
    csrfField.value = generateToken();
    // Store in sessionStorage to verify on submission
    sessionStorage.setItem('csrf_token', csrfField.value);
  }
}

/**
 * Generate a random token
 */
function generateToken() {
  return Math.random().toString(36).substr(2) + Date.now().toString(36);
}

/**
 * Validate Name Input
 */
function validateName() {
  const nameInput = document.getElementById('name');
  const nameError = document.getElementById('nameError');
  const value = nameInput.value.trim();
  
  // Sanitize: remove any HTML tags
  const sanitized = sanitizeInput(value);
  
  if (value.length < 2) {
    nameError.textContent = ' Name must be at least 2 characters';
    nameInput.classList.add('invalid');
    return false;
  }
  
  if (!/^[a-zA-Z\s]+$/.test(sanitized)) {
    nameError.textContent = ' Name can only contain letters and spaces';
    nameInput.classList.add('invalid');
    return false;
  }
  
  nameError.textContent = ' Valid';
  nameInput.classList.remove('invalid');
  return true;
}

/**
 * Validate Email Input
 */
function validateEmail() {
  const emailInput = document.getElementById('email');
  const emailError = document.getElementById('emailError');
  const value = emailInput.value.trim();
  
  // Sanitize input
  const sanitized = sanitizeInput(value);
  
  // Email regex pattern
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailPattern.test(sanitized)) {
    emailError.textContent = ' Please enter a valid email address';
    emailInput.classList.add('invalid');
    return false;
  }
  
  emailError.textContent = ' Valid';
  emailInput.classList.remove('invalid');
  return true;
}

/**
 * Validate Message Input
 */
function validateMessage() {
  const messageInput = document.getElementById('message');
  const messageError = document.getElementById('messageError');
  const value = messageInput.value.trim();
  
  if (value.length < 10) {
    messageError.textContent = ' Message must be at least 10 characters';
    messageInput.classList.add('invalid');
    return false;
  }
  
  if (value.length > 500) {
    messageError.textContent = ' Message must not exceed 500 characters';
    messageInput.classList.add('invalid');
    return false;
  }
  
  messageError.textContent = ' Valid';
  messageInput.classList.remove('invalid');
  return true;
}

/**
 * Sanitize Input - Remove HTML tags and dangerous characters
 */
function sanitizeInput(input) {
  const div = document.createElement('div');
  div.textContent = input; // textContent automatically escapes HTML
  return div.innerHTML;
}

/**
 * Escape HTML entities
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Handle Form Submission
 */
function handleFormSubmit(event) {
  event.preventDefault();
  
  // Verify CSRF token
  const csrfField = document.getElementById('csrf_token');
  const storedToken = sessionStorage.getItem('csrf_token');
  
  if (csrfField.value !== storedToken) {
    alert(' Security check failed. Please refresh and try again.');
    return;
  }
  
  // Validate all fields
  const isNameValid = validateName();
  const isEmailValid = validateEmail();
  const isMessageValid = validateMessage();
  
  if (!isNameValid || !isEmailValid || !isMessageValid) {
    alert(' Please fix the errors above before submitting.');
    return;
  }
  
  // Get sanitized values
  const name = sanitizeInput(document.getElementById('name').value.trim());
  const email = sanitizeInput(document.getElementById('email').value.trim());
  const message = sanitizeInput(document.getElementById('message').value.trim());
  
  // Prepare data
  const formData = {
    csrf_token: csrfField.value,
    name: name,
    email: email,
    message: message,
    timestamp: new Date().toISOString()
  };
  
  // In production, send to backend via fetch with HTTPS
  console.log('Sending form data:', formData);
  
  // Simulated submission (replace with actual backend call)
  submitFormToBackend(formData);
}

/**
 * Submit Form to Backend
 */
function submitFormToBackend(data) {
  const form = document.getElementById('contactForm')
  const submitBtn = document.getElementById('submitBtn')
  const formMessage = document.getElementById('formMessage')

  submitBtn.disabled = true
  submitBtn.textContent = 'Sending...'

  fetch(form.action, {
    method: 'POST',
    headers: { 'Accept': 'application/json' },
    body: new FormData(form)
  })
  .then(response => {
    if (response.ok) {
      formMessage.textContent = 'Message sent successfully!'
      formMessage.className = 'form-message success'
      form.reset()
      initCSRFToken()
    } else {
      throw new Error('Submission failed')
    }
  })
  .catch(error => {
    console.error('Error:', error)
    formMessage.textContent = 'Error sending message. Please try again.'
    formMessage.className = 'form-message error'
  })
  .finally(() => {
    submitBtn.disabled = false
    submitBtn.textContent = 'Send Message'
  })
}
/**
 * Handle Search with Input Sanitization
 */
function handleSearch(event) {
  const searchTerm = sanitizeInput(event.target.value.trim());
  console.log('Searching for:', searchTerm);
  
  // Filter products based on sanitized search term
  const catalog = document.getElementById('catalog');
  if (!catalog) return;
  
  const cards = catalog.querySelectorAll('.part-card');
  cards.forEach(card => {
    const title = card.querySelector('h3').textContent.toLowerCase();
    const description = card.querySelector('p').textContent.toLowerCase();
    
    if (title.includes(searchTerm.toLowerCase()) || 
        description.includes(searchTerm.toLowerCase())) {
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
    }
  });
}

/**
 * Rate Limiting - Prevent spam submissions
 */
function isRateLimited(action, maxAttempts = 5, timeWindow = 60000) {
  const key = `rateLimit_${action}`;
  const now = Date.now();
  const attempts = JSON.parse(localStorage.getItem(key) || '[]');
  
  // Remove old attempts outside the time window
  const recentAttempts = attempts.filter(timestamp => now - timestamp < timeWindow);
  
  if (recentAttempts.length >= maxAttempts) {
    return true; // Rate limited
  }
  
  recentAttempts.push(now);
  localStorage.setItem(key, JSON.stringify(recentAttempts));
  return false;
}

/**
 * Log Security Events (in production, send to server)
 */
function logSecurityEvent(event, details) {
  const log = {
    timestamp: new Date().toISOString(),
    event: event,
    details: details,
    userAgent: navigator.userAgent
  };
  console.warn('Security Event:', log);
  // In production, send to security logging service
}
