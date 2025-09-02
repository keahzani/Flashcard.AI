// Global state management
let currentFlashcards = [];
let reviewedCards = new Set();
let totalCards = 0;
let hasValidPayment = false; // Track payment status

// DOM Elements
const notesTextarea = document.getElementById("notes");
const flashcardsContainer = document.getElementById("flashcards");
const flashcardsSection = document.getElementById("flashcards-section");
const loadingOverlay = document.getElementById("loading-overlay");
const emptyState = document.getElementById("empty-state");
const studyControls = document.getElementById("study-controls");
const paymentModal = document.getElementById("payment-modal");
const successModal = document.getElementById("success-modal");

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
  initializeApp();
  setupEventListeners();
  loadFlashcards();
  checkPaymentStatus(); // Check for existing payment
});

function initializeApp() {
  // Character counter for textarea
  updateCharacterCount();
  
  // Set initial loading message
  updateLoadingMessage("Initializing...");
  
  // Setup payment form
  setupPaymentForm();
}

function setupEventListeners() {
  // Character counter
  notesTextarea.addEventListener('input', updateCharacterCount);
  
  // Auto-resize textarea
  notesTextarea.addEventListener('input', autoResizeTextarea);
  
  // Enter key handling (Ctrl+Enter to generate)
  notesTextarea.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 'Enter') {
      generateFlashcards();
    }
  });
  
  // Close modal when clicking outside
  paymentModal.addEventListener('click', function(e) {
    if (e.target === paymentModal) {
      closePaymentModal();
    }
  });
  
  successModal.addEventListener('click', function(e) {
    if (e.target === successModal) {
      closeSuccessModal();
    }
  });
  
  // Escape key to close modals
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      if (paymentModal.style.display === 'flex') {
        closePaymentModal();
      }
      if (successModal.style.display === 'flex') {
        closeSuccessModal();
      }
    }
  });
}

function setupPaymentForm() {
  const paymentForm = document.getElementById('payment-form');
  if (paymentForm) {
    paymentForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      const email = document.getElementById('customer-email').value.trim();
      const phone = document.getElementById('customer-phone').value.trim();
      
      // Basic validation
      if (!email || !phone) {
        showNotification("Please fill in all required fields.", "warning");
        return;
      }
      
      if (!isValidEmail(email)) {
        showNotification("Please enter a valid email address.", "warning");
        return;
      }
      
      if (!isValidPhone(phone)) {
        showNotification("Please enter a valid phone number (e.g., +254700000000).", "warning");
        return;
      }
      
      // Process payment
      processPayment(email, phone);
    });
  }
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidPhone(phone) {
  // Accept formats like +254700000000, 0700000000, etc.
  const phoneRegex = /^(\+?254|0)?[17]\d{8}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
}

function updateCharacterCount() {
  const charCount = document.querySelector('.char-count');
  if (charCount) {
    const count = notesTextarea.value.length;
    charCount.textContent = `${count} characters`;
    
    // Color coding based on content length
    if (count > 1000) {
      charCount.style.color = '#10b981'; // Green for good length
    } else if (count > 500) {
      charCount.style.color = '#f59e0b'; // Orange for medium length
    } else {
      charCount.style.color = '#6b7280'; // Gray for short
    }
  }
}

function autoResizeTextarea() {
  notesTextarea.style.height = 'auto';
  notesTextarea.style.height = Math.max(180, notesTextarea.scrollHeight) + 'px';
}

function clearNotes() {
  notesTextarea.value = '';
  updateCharacterCount();
  autoResizeTextarea();
  notesTextarea.focus();
}

// Enhanced generateFlashcards function
async function generateFlashcards() {
  const notes = notesTextarea.value.trim();
  
  if (!notes) {
    showNotification("Please paste your study notes first.", "warning");
    notesTextarea.focus();
    return;
  }

  // Show loading state
  showLoadingState(true);
  updateLoadingMessage("Analyzing your notes...");

  try {
    // Simulate processing steps for better UX
    await new Promise(resolve => setTimeout(resolve, 800));
    updateLoadingMessage("Generating questions...");
    
    const response = await fetch("/generate_flashcards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    updateLoadingMessage("Creating flashcards...");

    const flashcards = await response.json();
    
    if (!flashcards || flashcards.length === 0) {
      throw new Error("No flashcards were generated from your notes");
    }

    currentFlashcards = flashcards;
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Hide loading and display flashcards
    showLoadingState(false);
    displayFlashcards(flashcards, false);
    
    showNotification(`Successfully generated ${flashcards.length} flashcards!`, "success");
    
  } catch (error) {
    console.error("Error generating flashcards:", error);
    showLoadingState(false);
    
    let errorMessage = "Something went wrong while generating flashcards.";
    if (error.message.includes("Failed to fetch")) {
      errorMessage = "Unable to connect to the server. Please check your connection.";
    } else if (error.message.includes("No flashcards")) {
      errorMessage = "Couldn't generate flashcards from your notes. Try adding more detailed content.";
    }
    
    showNotification(errorMessage, "error");
  }
}

// Enhanced loadFlashcards function
async function loadFlashcards() {
  try {
    showLoadingState(true);
    updateLoadingMessage("Loading saved flashcards...");
    
    const response = await fetch("/get_flashcards");
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const flashcards = await response.json();
    showLoadingState(false);
    
    if (flashcards && flashcards.length > 0) {
      currentFlashcards = flashcards;
      displayFlashcards(flashcards, true);
    } else {
      showEmptyState();
    }
    
  } catch (error) {
    console.error("Error loading flashcards:", error);
    showLoadingState(false);
    showEmptyState();
  }
}

// Enhanced displayFlashcards function
function displayFlashcards(flashcards, saved) {
  flashcardsContainer.innerHTML = "";
  reviewedCards.clear();
  totalCards = flashcards.length;
  
  // Show flashcards section and hide empty state
  flashcardsSection.style.display = 'block';
  emptyState.style.display = 'none';
  studyControls.style.display = flashcards.length > 0 ? 'flex' : 'none';

  flashcards.forEach((card, index) => {
    const cardElement = createFlashcardElement(card, index, saved);
    flashcardsContainer.appendChild(cardElement);
  });
  
  updateProgress();
  
  // Scroll to flashcards section
  setTimeout(() => {
    flashcardsSection.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'start' 
    });
  }, 100);
}

function createFlashcardElement(card, index, saved) {
  const cardElement = document.createElement("div");
  cardElement.classList.add("flashcard");
  cardElement.dataset.index = index;
  
  // Add staggered animation delay
  cardElement.style.animationDelay = `${index * 0.1}s`;

  cardElement.innerHTML = `
    <div class="flashcard-inner">
      <div class="flashcard-front">
        <div class="card-content">
          <div class="card-number">#${index + 1}</div>
          <div class="question-text">${escapeHtml(card.question)}</div>
          <div class="flip-hint">
            <i class="fas fa-sync-alt"></i>
            Click to reveal answer
          </div>
        </div>
      </div>
      <div class="flashcard-back">
        <div class="card-content">
          <div class="answer-label">Answer</div>
          <div class="answer-text">${escapeHtml(card.answer)}</div>
          <div class="flip-hint">
            <i class="fas fa-sync-alt"></i>
            Click to see question
          </div>
        </div>
      </div>
    </div>
    ${!saved ? `<button class="save-btn" onclick="saveFlashcard('${escapeHtml(card.question)}', '${escapeHtml(card.answer)}', ${index})">
      <i class="fas fa-save"></i>
      <span>Save Card</span>
    </button>` : ''}
  `;

  // Enhanced flip functionality
  const cardInner = cardElement.querySelector(".flashcard-inner");
  cardInner.addEventListener("click", () => flipCard(cardElement, index));

  return cardElement;
}

function flipCard(cardElement, index) {
  const wasFlipped = cardElement.classList.contains("flipped");
  cardElement.classList.toggle("flipped");
  
  // Track reviewed cards
  if (!wasFlipped) {
    reviewedCards.add(index);
    updateProgress();
    
    // Add visual feedback for first flip
    setTimeout(() => {
      cardElement.classList.add("reviewed");
    }, 300);
  }
  
  // Haptic feedback on mobile
  if ('vibrate' in navigator) {
    navigator.vibrate(50);
  }
}

// Enhanced saveFlashcard function
async function saveFlashcard(question, answer, index) {
  const saveBtn = document.querySelector(`[data-index="${index}"] .save-btn`);
  const originalContent = saveBtn.innerHTML;
  
  // Show loading state on button
  saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Saving...</span>';
  saveBtn.disabled = true;

  try {
    const response = await fetch("/save_flashcard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, answer })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    // Success feedback
    saveBtn.innerHTML = '<i class="fas fa-check"></i> <span>Saved!</span>';
    saveBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    
    setTimeout(() => {
      saveBtn.style.display = 'none';
    }, 1500);
    
    showNotification(result.message || "Flashcard saved successfully!", "success");
    
  } catch (error) {
    console.error("Error saving flashcard:", error);
    
    // Reset button state
    saveBtn.innerHTML = originalContent;
    saveBtn.disabled = false;
    
    showNotification("Could not save flashcard. Please try again.", "error");
  }
}

// Study control functions
function shuffleCards() {
  if (currentFlashcards.length === 0) return;
  
  // Shuffle the array
  for (let i = currentFlashcards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [currentFlashcards[i], currentFlashcards[j]] = [currentFlashcards[j], currentFlashcards[i]];
  }
  
  // Re-display with new order
  displayFlashcards(currentFlashcards, true);
  showNotification("Cards shuffled! Ready for a new study session.", "info");
}

function resetProgress() {
  // Reset all flipped states
  document.querySelectorAll('.flashcard.flipped').forEach(card => {
    card.classList.remove('flipped', 'reviewed');
  });
  
  reviewedCards.clear();
  updateProgress();
  showNotification("Progress reset! Start studying again.", "info");
}

function downloadCards() {
  if (currentFlashcards.length === 0) {
    showNotification("No flashcards to download.", "warning");
    return;
  }
  
  // Create downloadable content
  let content = "AI Study Buddy - Flashcards\n";
  content += "=" + "=".repeat(30) + "\n\n";
  content += `Generated on: ${new Date().toLocaleDateString()}\n`;
  content += `Total Cards: ${currentFlashcards.length}\n\n`;
  
  currentFlashcards.forEach((card, index) => {
    content += `Card ${index + 1}:\n`;
    content += `Q: ${card.question}\n`;
    content += `A: ${card.answer}\n`;
    content += "-".repeat(40) + "\n\n";
  });
  
  content += "\nThank you for using AI Study Buddy!\n";
  content += "For more features, visit our website.";
  
  // Create and trigger download
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `flashcards-${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showNotification("Flashcards downloaded successfully! 🎉", "success");
}

// Payment-related functions
function initiatePayment() {
  if (currentFlashcards.length === 0) {
    showNotification("Generate flashcards first before purchasing download access.", "warning");
    return;
  }
  
  // Check if user already has valid payment for this session
  if (hasValidPayment) {
    downloadCards();
    return;
  }
  
  // Show payment modal
  paymentModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  
  // Focus on email input
  setTimeout(() => {
    document.getElementById('customer-email').focus();
  }, 300);
}

function closePaymentModal() {
  paymentModal.style.display = 'none';
  document.body.style.overflow = '';
}

function closeSuccessModal() {
  successModal.style.display = 'none';
  document.body.style.overflow = '';
}

async function processPayment(email, phone) {
  try {
    showNotification("Processing payment...", "info");
    
    const response = await fetch('/create_payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email,
        phone: phone,
        amount: 1.00,
        flashcard_count: currentFlashcards.length
      })
    });

    if (!response.ok) {
      throw new Error(`Payment failed: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.success) {
      // Payment successful
      hasValidPayment = true;
      closePaymentModal();
      
      // Show success modal
      successModal.style.display = 'flex';
      
      // Auto-close success modal and start download
      setTimeout(() => {
        closeSuccessModal();
        downloadCards();
      }, 2000);
      
      showNotification("Payment successful! Download starting...", "success");
      
      // Store payment status in session storage for this session
      sessionStorage.setItem('paymentValid', 'true');
      sessionStorage.setItem('paymentTime', Date.now().toString());
      
    } else {
      throw new Error(result.message || 'Payment processing failed');
    }
    
  } catch (error) {
    console.error('Payment error:', error);
    showNotification(
      error.message || "Payment failed. Please try again.", 
      "error"
    );
  }
}

// Check for existing valid payment on page load
function checkPaymentStatus() {
  const paymentValid = sessionStorage.getItem('paymentValid');
  const paymentTime = sessionStorage.getItem('paymentTime');
  
  if (paymentValid === 'true' && paymentTime) {
    const timeDiff = Date.now() - parseInt(paymentTime);
    const hoursDiff = timeDiff / (1000 * 60 * 60);
    
    // Payment valid for 24 hours
    if (hoursDiff < 24) {
      hasValidPayment = true;
      updateDownloadButton();
    } else {
      // Clear expired payment
      sessionStorage.removeItem('paymentValid');
      sessionStorage.removeItem('paymentTime');
    }
  }
}

function updateDownloadButton() {
  const downloadBtn = document.querySelector('.premium-btn');
  if (downloadBtn && hasValidPayment) {
    downloadBtn.innerHTML = `
      <i class="fas fa-download"></i>
      <span>Download</span>
    `;
    downloadBtn.classList.remove('premium-btn');
    downloadBtn.onclick = downloadCards;
  }
}

// UI Helper Functions
function showLoadingState(show) {
  if (show) {
    loadingOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  } else {
    loadingOverlay.style.display = 'none';
    document.body.style.overflow = '';
  }
}

function updateLoadingMessage(message) {
  const loadingMessage = document.querySelector('.loading-message');
  if (loadingMessage) {
    loadingMessage.textContent = message;
  }
}

function showEmptyState() {
  flashcardsSection.style.display = 'block';
  flashcardsContainer.style.display = 'none';
  emptyState.style.display = 'block';
  studyControls.style.display = 'none';
  updateProgress();
}

function hideEmptyState() {
  if (flashcardsContainer) {
    flashcardsContainer.style.display = 'grid';
  }
  if (emptyState) {
    emptyState.style.display = 'none';
  }
  // Ensure the main section is visible
  if (flashcardsSection) {
    flashcardsSection.style.display = 'block';
  }
}

function updateProgress() {
  const totalElement = document.getElementById("total-cards");
  const reviewedElement = document.getElementById("reviewed-cards");
  
  if (totalElement) totalElement.textContent = totalCards;
  if (reviewedElement) reviewedElement.textContent = reviewedCards.size;
  
  // Update progress percentage for potential progress bar
  const progressPercentage = totalCards > 0 ? (reviewedCards.size / totalCards) * 100 : 0;
  document.documentElement.style.setProperty('--progress-percentage', `${progressPercentage}%`);
}

// Notification system
function showNotification(message, type = 'info') {
  // Remove existing notifications
  document.querySelectorAll('.notification').forEach(n => n.remove());
  
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  
  const icons = {
    success: 'fas fa-check-circle',
    error: 'fas fa-exclamation-circle',
    warning: 'fas fa-exclamation-triangle',
    info: 'fas fa-info-circle'
  };
  
  notification.innerHTML = `
    <i class="${icons[type]}"></i>
    <span>${message}</span>
    <button class="notification-close" onclick="this.parentElement.remove()">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  document.body.appendChild(notification);
  
  // Auto remove after 5 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }
  }, 5000);
}

// Enhanced generateFlashcards function with better UX
async function generateFlashcards() {
  const notes = notesTextarea.value.trim();
  
  if (!notes) {
    showNotification("Please paste your study notes first.", "warning");
    notesTextarea.focus();
    return;
  }

  if (notes.length < 50) {
    showNotification("Your notes seem too short. Add more content for better flashcards.", "warning");
    return;
  }

  try {
    showLoadingState(true);
    updateLoadingMessage("Analyzing your notes...");
    
    // Simulate processing steps for better UX
    await new Promise(resolve => setTimeout(resolve, 800));
    updateLoadingMessage("Extracting key concepts...");
    
    const response = await fetch("/generate_flashcards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes })
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status} ${response.statusText}`);
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    updateLoadingMessage("Creating flashcards...");

    const flashcards = await response.json();
    
    if (!flashcards || !Array.isArray(flashcards) || flashcards.length === 0) {
      throw new Error("No flashcards were generated from your notes");
    }

    currentFlashcards = flashcards;
    await new Promise(resolve => setTimeout(resolve, 300));
    
    showLoadingState(false);
    displayFlashcards(flashcards, false);
    
    showNotification(`🎉 Successfully generated ${flashcards.length} flashcards!`, "success");
    
  } catch (error) {
    console.error("Error generating flashcards:", error);
    showLoadingState(false);
    
    let errorMessage = "Something went wrong while generating flashcards.";
    
    if (error.message.includes("Failed to fetch") || error.name === 'TypeError') {
      errorMessage = "Unable to connect to the server. Please check your connection and try again.";
    } else if (error.message.includes("No flashcards")) {
      errorMessage = "Couldn't generate flashcards from your notes. Try adding more detailed content with key concepts and facts.";
    } else if (error.message.includes("Server error")) {
      errorMessage = "Server is temporarily unavailable. Please try again in a moment.";
    }
    
    showNotification(errorMessage, "error");
  }
}

// Enhanced loadFlashcards function
async function loadFlashcards() {
  try {
    const response = await fetch("/get_flashcards");
    
    if (!response.ok) {
      if (response.status === 404) {
        showEmptyState();
        return;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const flashcards = await response.json();
    
    if (flashcards && flashcards.length > 0) {
      currentFlashcards = flashcards;
      displayFlashcards(flashcards, true);
    } else {
      showEmptyState();
    }
    
  } catch (error) {
    console.error("Error loading flashcards:", error);
    showEmptyState();
    
    if (!error.message.includes("404")) {
      showNotification("Could not load saved flashcards.", "error");
    }
  }
}

// Enhanced displayFlashcards function
function displayFlashcards(flashcards, saved) {
  console.log("Displaying flashcards:", flashcards); // Debug log
  
  hideEmptyState();
  flashcardsContainer.innerHTML = "";
  reviewedCards.clear();
  totalCards = flashcards.length;

  // Ensure flashcards section is visible
  flashcardsSection.style.display = 'block';
  
  flashcards.forEach((card, index) => {
    const cardElement = createFlashcardElement(card, index, saved);
    flashcardsContainer.appendChild(cardElement);
  });
  
  if (studyControls) {
    studyControls.style.display = 'flex';
  }
  updateProgress();
  
  console.log("Flashcards displayed, total:", totalCards); // Debug log
}

function createFlashcardElement(card, index, saved) {
  const cardElement = document.createElement("div");
  cardElement.classList.add("flashcard");
  cardElement.dataset.index = index;
  
  // Add staggered animation delay
  cardElement.style.animationDelay = `${index * 0.1}s`;

  cardElement.innerHTML = `
    <div class="flashcard-inner">
      <div class="flashcard-front">
        <div class="card-number">#${index + 1}</div>
        <div class="card-content">${escapeHtml(card.question)}</div>
        <div class="flip-hint">
          <i class="fas fa-sync-alt"></i>
          Click to reveal
        </div>
      </div>
      <div class="flashcard-back">
        <div class="answer-label">Answer</div>
        <div class="card-content">${escapeHtml(card.answer)}</div>
        <div class="flip-hint">
          <i class="fas fa-sync-alt"></i>
          Click for question
        </div>
      </div>
    </div>
    ${!saved ? `<button class="save-btn" onclick="saveFlashcard('${escapeHtml(card.question)}', '${escapeHtml(card.answer)}', ${index})">
      <i class="fas fa-save"></i>
      <span>Save Card</span>
    </button>` : ''}
  `;

  // Enhanced flip functionality
  const cardInner = cardElement.querySelector(".flashcard-inner");
  cardInner.addEventListener("click", () => flipCard(cardElement, index));

  return cardElement;
}

function flipCard(cardElement, index) {
  const wasFlipped = cardElement.classList.contains("flipped");
  cardElement.classList.toggle("flipped");
  
  // Track reviewed cards
  if (!wasFlipped) {
    reviewedCards.add(index);
    updateProgress();
    
    // Add visual feedback for first flip
    setTimeout(() => {
      cardElement.classList.add("reviewed");
    }, 300);
  }
  
  // Haptic feedback on mobile
  if ('vibrate' in navigator) {
    navigator.vibrate(50);
  }
  
  // Add flip sound effect (optional - can be enabled later)
  // playFlipSound();
}

// Enhanced saveFlashcard function
async function saveFlashcard(question, answer, index) {
  const saveBtn = document.querySelector(`[data-index="${index}"] .save-btn`);
  if (!saveBtn) return;
  
  const originalContent = saveBtn.innerHTML;
  
  // Show loading state on button
  saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Saving...</span>';
  saveBtn.disabled = true;

  try {
    const response = await fetch("/save_flashcard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, answer })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    // Success feedback
    saveBtn.innerHTML = '<i class="fas fa-check"></i> <span>Saved!</span>';
    saveBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    
    setTimeout(() => {
      saveBtn.style.opacity = '0';
      setTimeout(() => {
        saveBtn.style.display = 'none';
      }, 300);
    }, 1500);
    
    showNotification(result.message || "Flashcard saved successfully!", "success");
    
  } catch (error) {
    console.error("Error saving flashcard:", error);
    
    // Reset button state
    saveBtn.innerHTML = originalContent;
    saveBtn.disabled = false;
    
    let errorMessage = "Could not save flashcard. Please try again.";
    if (error.message.includes("Failed to fetch")) {
      errorMessage = "Connection error. Please check your internet and try again.";
    }
    
    showNotification(errorMessage, "error");
  }
}

// Utility Functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
  // Escape to close loading
  if (e.key === 'Escape' && loadingOverlay.style.display === 'flex') {
    showLoadingState(false);
  }
  
  // Ctrl+S to save all cards (if not saved)
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    const unsavedCards = document.querySelectorAll('.save-btn:not([style*="display: none"])');
    if (unsavedCards.length > 0) {
      showNotification("Use individual save buttons on each card.", "info");
    }
  }
});

// Performance optimization: Debounced character counter
const debouncedCharCount = debounce(updateCharacterCount, 300);
if (notesTextarea) {
  notesTextarea.removeEventListener('input', updateCharacterCount);
  notesTextarea.addEventListener('input', debouncedCharCount);
}