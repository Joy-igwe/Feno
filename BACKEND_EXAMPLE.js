/**
 * BACKEND EXAMPLE - Node.js/Express
 * This file shows how to properly secure the form submission on the server side
 * 
 * IMPORTANT: This is REQUIRED for production deployment!
 * Client-side validation alone is NOT sufficient.
 */

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const csrf = require('csurf');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

// ============================================
// 1. SECURITY MIDDLEWARE
// ============================================

// Add security headers
app.use(helmet());

// Parse request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: true,
  store: new MongoStore({ 
    mongoUrl: process.env.MONGODB_URL 
  }),
  cookie: { 
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 3600000 // 1 hour
  }
}));

// CSRF Protection
app.use(csrf({ cookie: false })); // Store token in session instead of cookie

// Rate limiting
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit to 5 requests per IP per 15 minutes
  message: 'Too many contact submissions, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.connection.remoteAddress,
  skip: (req) => req.path !== '/api/contact'
});

app.use(contactLimiter);

// Custom security headers
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ============================================
// 2. VALIDATION UTILITIES
// ============================================

function validateContactForm(data) {
  const errors = {};

  // Validate name
  if (!data.name || typeof data.name !== 'string') {
    errors.name = 'Name is required';
  } else {
    const sanitizedName = validator.trim(data.name);
    if (sanitizedName.length < 2) {
      errors.name = 'Name must be at least 2 characters';
    }
    if (sanitizedName.length > 100) {
      errors.name = 'Name cannot exceed 100 characters';
    }
    if (!validator.isAlpha(sanitizedName, 'en-US', { ignore: ' ' })) {
      errors.name = 'Name can only contain letters and spaces';
    }
  }

  // Validate email
  if (!data.email || typeof data.email !== 'string') {
    errors.email = 'Email is required';
  } else {
    const sanitizedEmail = validator.normalizeEmail(data.email);
    if (!validator.isEmail(sanitizedEmail)) {
      errors.email = 'Please provide a valid email address';
    }
    if (sanitizedEmail.length > 100) {
      errors.email = 'Email cannot exceed 100 characters';
    }
  }

  // Validate message
  if (!data.message || typeof data.message !== 'string') {
    errors.message = 'Message is required';
  } else {
    const sanitizedMessage = validator.trim(data.message);
    if (sanitizedMessage.length < 10) {
      errors.message = 'Message must be at least 10 characters';
    }
    if (sanitizedMessage.length > 500) {
      errors.message = 'Message cannot exceed 500 characters';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors: errors
  };
}

function sanitizeContactData(data) {
  return {
    name: validator.trim(validator.escape(data.name)),
    email: validator.normalizeEmail(data.email),
    message: validator.trim(validator.escape(data.message)),
    submittedAt: new Date(),
    ipAddress: data.ipAddress,
    userAgent: data.userAgent
  };
}

// ============================================
// 3. DATABASE SCHEMA (MongoDB)
// ============================================

const ContactSchema = {
  name: { type: String, required: true, maxlength: 100 },
  email: { type: String, required: true, maxlength: 100 },
  message: { type: String, required: true, maxlength: 500 },
  submittedAt: { type: Date, default: Date.now },
  ipAddress: String,
  userAgent: String,
  read: { type: Boolean, default: false },
  spam: { type: Boolean, default: false }
};

// Use parameterized queries (mongoose automatically does this)
// NEVER use string concatenation for database queries

// ============================================
// 4. EMAIL CONFIGURATION
// ============================================

const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD // Use app-specific password
  }
});

async function sendContactEmail(contactData) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.CONTACT_EMAIL,
    subject: `New Contact Form Submission from ${contactData.name}`,
    html: `
      <h2>New Contact Form Submission</h2>
      <p><strong>Name:</strong> ${contactData.name}</p>
      <p><strong>Email:</strong> ${contactData.email}</p>
      <p><strong>Message:</strong> ${contactData.message}</p>
      <p><small>Submitted at: ${contactData.submittedAt}</small></p>
    `
  };

  try {
    await emailTransporter.sendMail(mailOptions);
    console.log('Email sent successfully');
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

// ============================================
// 5. API ENDPOINTS
// ============================================

// GET CSRF token (for form initialization)
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// POST contact form
app.post('/api/contact', (req, res) => {
  try {
    // Verify CSRF token (middleware already does this)
    // If we reach here, token is valid

    // Validate input
    const validation = validateContactForm(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Validation failed',
        errors: validation.errors
      });
    }

    // Get user IP and user agent
    const userIp = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent');

    // Sanitize data
    const sanitizedData = sanitizeContactData({
      ...req.body,
      ipAddress: userIp,
      userAgent: userAgent
    });

    // Check for spam patterns
    if (isLikelySpam(sanitizedData)) {
      console.warn('Potential spam detected:', sanitizedData);
      return res.status(400).json({ error: 'Message appears to be spam' });
    }

    // Save to database (using parameterized queries)
    // Example with MongoDB:
    // const contact = new Contact(sanitizedData);
    // await contact.save();

    // Send email notification
    sendContactEmail(sanitizedData).catch(err => {
      console.error('Failed to send email:', err);
      // Don't fail the API call if email fails
    });

    // Log successful submission
    console.log('Contact form submitted successfully:', {
      email: sanitizedData.email,
      timestamp: new Date().toISOString()
    });

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Thank you for your message. We will get back to you soon.'
    });

  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({
      error: 'An error occurred. Please try again later.'
    });
  }
});

// ============================================
// 6. SPAM DETECTION
// ============================================

function isLikelySpam(data) {
  const spamPatterns = [
    /viagra|cialis|casino|lottery/gi,
    /http:\/\/|https:\/\/(?!efeno\.com)/gi, // Allow only efeno.com URLs
    /<script|javascript:|onclick|onerror/gi,
    /\b(bit\.ly|tinyurl|short\.link)\b/gi
  ];

  const textToCheck = `${data.name} ${data.email} ${data.message}`;

  for (let pattern of spamPatterns) {
    if (pattern.test(textToCheck)) {
      return true;
    }
  }

  // Check for repetitive characters (common spam)
  if (/(.)\1{10,}/.test(data.message)) {
    return true;
  }

  return false;
}

// ============================================
// 7. ERROR HANDLING
// ============================================

// CSRF error handler
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    res.status(403).json({ error: 'Invalid CSRF token' });
  } else if (err instanceof express.multer.MulterError) {
    res.status(400).json({ error: 'File upload error' });
  } else {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// 8. ENVIRONMENT VARIABLES (.env file)
// ============================================

/*
NODE_ENV=production
SESSION_SECRET=your-very-long-random-secret-key-here
MONGODB_URL=mongodb+srv://user:password@cluster.mongodb.net/dbname
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-specific-password
CONTACT_EMAIL=contact@efeno.com
PORT=3000
RECAPTCHA_SECRET_KEY=your-recaptcha-secret-key
*/

// ============================================
// 9. START SERVER
// ============================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// ============================================
// IMPORTANT NOTES FOR PRODUCTION
// ============================================

/*
1. ALWAYS use HTTPS in production
2. Never hardcode secrets - use environment variables
3. Use strong session secrets (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
4. Implement database backups
5. Use prepared/parameterized queries to prevent SQL injection
6. Add logging and monitoring for security events
7. Regular security audits and dependency updates
8. Rate limiting is essential to prevent abuse
9. Consider adding 2FA for admin areas
10. Monitor for security vulnerabilities: npm audit, snyk.io

RUN THESE COMMANDS:
$ npm install express helmet express-rate-limit validator csurf express-session connect-mongo nodemailer dotenv

GENERATE STRONG SECRET:
$ node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
*/
