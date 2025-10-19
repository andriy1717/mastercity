// NEW TRADE MODAL CONTROLLER
// Add this to client.js or include as separate file

console.log('✅ trade-modal-controller.js is loading...');

// Trade modal state
const TradeModal = {
  currentStep: 1,
  action: null, // 'buy', 'sell', 'trade'
  resource: null,
  quantity: 1,
  targetPlayer: null,
  giveResource: null,
  giveQuantity: 1,
  wantResource: null,
  wantQuantity: 1,

  // Resource data
  resourceIcons: {
    wood: '🪵',
    rock: '🪨',
    metal: '⚙️',
    food: '🍞',
    coins: '💰'
  },

  resourceNames: {
    wood: 'Wood',
    rock: 'Rock',
    metal: 'Metal',
    food: 'Food',
    coins: 'Golden Coins'
  },

  // Bank pricing (Buy: 2:1, Sell: 3:1 ratio)
  getBuyCost(resource, qty) {
    return qty * 2; // 2 coins per resource
  },

  getSellValue(resource, qty) {
    return Math.floor(qty / 3); // 1 coin per 3 resources
  },

  // Show/hide steps
  showStep(stepNum) {
    for (let i = 1; i <= 8; i++) {
      const step = document.getElementById(`tradeStep${i}`);
      if (step) step.classList.toggle('hidden', i !== stepNum);
    }
    document.getElementById('tradeResult')?.classList.add('hidden');
    this.currentStep = stepNum;
  },

  // Show result screen
  showResult(success, title, message, hideCloseButton = false) {
    document.querySelectorAll('.trade-step').forEach(el => el.classList.add('hidden'));
    const resultDiv = document.getElementById('tradeResult');
    resultDiv.classList.remove('hidden');
    document.getElementById('resultIcon').textContent = success ? '✅' : '❌';
    document.getElementById('resultTitle').textContent = title;
    document.getElementById('resultMessage').textContent = message;
    document.getElementById('resultMessage').style.whiteSpace = 'normal';

    // Hide close button for auto-closing messages (bank trades)
    const closeBtn = document.getElementById('closeTradeModal');
    if (closeBtn) {
      closeBtn.style.display = hideCloseButton ? 'none' : 'block';
    }

    // Hide offer buttons if they exist
    const offerButtons = resultDiv.querySelector('.offer-buttons');
    if (offerButtons) {
      offerButtons.style.display = 'none';
    }
  },

  // Initialize modal
  init() {
    console.log('TradeModal.init() called');
    const modal = document.getElementById('tradeModal');
    const closeBtn = document.getElementById('tradeClose');

    console.log('Found modal and closeBtn:', { modal, closeBtn });

    // Use event delegation on document body to capture clicks on the trade button
    // This survives even if the button's innerHTML is changed
    document.body.addEventListener('click', (e) => {
      const btn = e.target.closest('#openTradeBtn');
      if (btn) {
        console.log('Trade button clicked via delegation!', 'disabled:', btn.disabled);

        // Check if button is disabled
        if (btn.disabled) {
          console.log('Button is disabled, not opening modal');
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        console.log('Opening trade modal...');
        this.reset();
        modal.classList.remove('hidden');
        this.showStep(1);
      }
    }, true); // Use capture phase

    console.log('Trade modal event delegation set up successfully');

    // Close modal
    if (closeBtn) {
      closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    }

    // Close result button
    document.getElementById('closeTradeModal')?.addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    // Step 1: Choose action
    document.querySelectorAll('.trade-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.action = btn.dataset.action;
        if (this.action === 'trade') {
          this.loadPlayers();
          this.showStep(4); // Go to player selection
        } else {
          document.getElementById('step2Title').textContent =
            this.action === 'buy' ? 'What to Buy?' : 'What to Sell?';
          this.showStep(2); // Go to resource selection
        }
      });
    });

    // Step 2: Resource selection (BUY/SELL)
    document.querySelectorAll('#tradeStep2 .resource-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.resource = btn.dataset.resource;
        this.updateResourceDisplay();
        // Set initial quantity based on action (sell requires minimum 3)
        this.quantity = this.action === 'sell' ? 3 : 1;
        this.updateQuantityDisplay();
        this.showStep(3);
      });
    });

    // Step 3: Quantity controls
    const decreaseBtn = document.getElementById('decreaseQty');
    const increaseBtn = document.getElementById('increaseQty');

    // Remove any existing listeners by cloning
    if (decreaseBtn) {
      const newDecreaseBtn = decreaseBtn.cloneNode(true);
      decreaseBtn.replaceWith(newDecreaseBtn);
      newDecreaseBtn.addEventListener('click', () => {
        const increment = this.action === 'sell' ? 3 : 1;
        const minQty = this.action === 'sell' ? 3 : 1;
        if (this.quantity > minQty) {
          this.quantity -= increment;
          if (this.quantity < minQty) this.quantity = minQty;
          this.updateQuantityDisplay();
        }
      });
    }

    if (increaseBtn) {
      const newIncreaseBtn = increaseBtn.cloneNode(true);
      increaseBtn.replaceWith(newIncreaseBtn);
      newIncreaseBtn.addEventListener('click', () => {
        const increment = this.action === 'sell' ? 3 : 1;
        this.quantity += increment;
        this.updateQuantityDisplay();
      });
    }

    // Step 3: Confirm trade (BUY/SELL)
    document.getElementById('confirmTrade')?.addEventListener('click', () => {
      this.executeBankTrade();
    });

    // Step 5: Select give resource (TRADE)
    document.querySelectorAll('.give-resource').forEach(btn => {
      btn.addEventListener('click', () => {
        this.giveResource = btn.dataset.resource;
        this.updateGiveResourceDisplay();
        this.giveQuantity = 1;
        document.getElementById('giveQuantityDisplay').textContent = '1';
        this.showStep(6);
      });
    });

    // Step 6: Give quantity controls
    document.getElementById('decreaseGiveQty')?.addEventListener('click', () => {
      if (this.giveQuantity > 1) {
        this.giveQuantity--;
        document.getElementById('giveQuantityDisplay').textContent = this.giveQuantity;
      }
    });

    document.getElementById('increaseGiveQty')?.addEventListener('click', () => {
      this.giveQuantity++;
      document.getElementById('giveQuantityDisplay').textContent = this.giveQuantity;
    });

    document.getElementById('continueToWant')?.addEventListener('click', () => {
      document.getElementById('offerSummary').textContent =
        `${this.giveQuantity} ${this.resourceNames[this.giveResource]}`;
      this.showStep(7);
    });

    // Step 7: Select want resource
    document.querySelectorAll('.want-resource').forEach(btn => {
      btn.addEventListener('click', () => {
        this.wantResource = btn.dataset.resource;
        this.updateWantResourceDisplay();
        this.wantQuantity = 1;
        document.getElementById('wantQuantityDisplay').textContent = '1';
        this.updateTradeSummary();
        this.showStep(8);
      });
    });

    // Step 8: Want quantity controls
    document.getElementById('decreaseWantQty')?.addEventListener('click', () => {
      if (this.wantQuantity > 1) {
        this.wantQuantity--;
        document.getElementById('wantQuantityDisplay').textContent = this.wantQuantity;
        this.updateTradeSummary();
      }
    });

    document.getElementById('increaseWantQty')?.addEventListener('click', () => {
      this.wantQuantity++;
      document.getElementById('wantQuantityDisplay').textContent = this.wantQuantity;
      this.updateTradeSummary();
    });

    // Step 8: Send player offer
    document.getElementById('sendPlayerOffer')?.addEventListener('click', () => {
      this.sendPlayerTrade();
    });

    // Back buttons
    document.getElementById('backToStep1')?.addEventListener('click', () => this.showStep(1));
    document.getElementById('backToStep2')?.addEventListener('click', () => this.showStep(2));
    document.getElementById('backToStep1FromPlayer')?.addEventListener('click', () => this.showStep(1));
    document.getElementById('backToStep4')?.addEventListener('click', () => this.showStep(4));
    document.getElementById('backToStep6')?.addEventListener('click', () => this.showStep(6));
    document.getElementById('backToStep7')?.addEventListener('click', () => this.showStep(7));
  },

  // Update displays
  updateResourceDisplay() {
    document.getElementById('selectedResourceIcon').textContent = this.resourceIcons[this.resource];
    document.getElementById('selectedResourceName').textContent = this.resourceNames[this.resource];
  },

  updateGiveResourceDisplay() {
    document.getElementById('giveResourceIcon').textContent = this.resourceIcons[this.giveResource];
    document.getElementById('giveResourceName').textContent = this.resourceNames[this.giveResource];
  },

  updateWantResourceDisplay() {
    document.getElementById('wantResourceIcon').textContent = this.resourceIcons[this.wantResource];
    document.getElementById('wantResourceName').textContent = this.resourceNames[this.wantResource];
  },

  updateQuantityDisplay() {
    document.getElementById('quantityDisplay').textContent = this.quantity;
    const costDiv = document.getElementById('costDisplay');

    if (this.action === 'buy') {
      const cost = this.getBuyCost(this.resource, this.quantity);
      costDiv.innerHTML = `<span style="color: #d4a82e;">Cost: ${cost} Golden Coins</span>`;
    } else if (this.action === 'sell') {
      const value = this.getSellValue(this.resource, this.quantity);
      costDiv.innerHTML = `<span style="color: #1bb56d;">You'll receive: ${value} Golden Coins</span>`;
    }
  },

  updateTradeSummary() {
    const summary = `${this.giveQuantity} ${this.resourceNames[this.giveResource]} → ${this.wantQuantity} ${this.resourceNames[this.wantResource]}`;
    document.getElementById('finalTradeSummary').textContent = summary;
  },

  // Load players for trade
  loadPlayers() {
    const grid = document.getElementById('playerGrid');
    grid.innerHTML = '';

    if (!PLAYERS) return;

    Object.keys(PLAYERS).forEach(pid => {
      if (pid === ME) return; // Skip self

      const player = PLAYERS[pid];
      const btn = document.createElement('button');
      btn.className = 'resource-btn';
      btn.style.padding = '15px';
      btn.innerHTML = `
        <div style="font-size: 32px;">${player.isAi ? '🤖' : '👤'}</div>
        <div style="font-weight: bold; margin-top: 6px;">${pid}</div>
        <div style="font-size: 12px; opacity: 0.7;">${player.civ || 'Unknown'}</div>
      `;
      btn.addEventListener('click', () => {
        this.targetPlayer = pid;
        document.getElementById('selectedPlayerName').textContent = pid;
        this.showStep(5);
      });
      grid.appendChild(btn);
    });
  },

  // Execute bank trade
  executeBankTrade() {
    const mode = this.action; // 'buy' or 'sell'
    const type = this.resource;
    const amount = this.quantity;

    console.log('Executing bank trade:', { mode, type, amount });

    // Use emitAction which is the correct way client.js handles actions
    if (typeof emitAction === 'function') {
      emitAction('trade', { mode: mode, type: type, amount: amount });
    } else {
      console.error('emitAction function not found!');
      alert('Cannot execute trade - emitAction not available');
      return;
    }

    // Show success message without buttons
    const msg = mode === 'buy'
      ? `Purchased ${amount} ${this.resourceNames[type]} for ${this.getBuyCost(type, amount)} Golden Coins.`
      : `Sold ${amount} ${this.resourceNames[type]} for ${this.getSellValue(type, amount)} Golden Coins.`;

    this.showResult(true, 'Trade Completed!', msg, true); // true = hide close button

    // Auto-close modal after 1.5 seconds
    setTimeout(() => {
      document.getElementById('tradeModal').classList.add('hidden');
    }, 1500);
  },

  // Send player trade
  sendPlayerTrade() {
    socket.emit('proposeTrade', {
      code: ROOM.code,
      from: ME,
      to: this.targetPlayer,
      offer: {
        give: {
          type: this.giveResource,
          amount: this.giveQuantity
        },
        want: {
          type: this.wantResource,
          amount: this.wantQuantity
        }
      }
    });

    this.showResult(true, 'Offer Sent!',
      `Your trade offer has been sent to ${this.targetPlayer}. Waiting for their response...`);

    setTimeout(() => {
      document.getElementById('tradeModal').classList.add('hidden');
    }, 2000);
  },

  // Reset state
  reset() {
    this.currentStep = 1;
    this.action = null;
    this.resource = null;
    this.quantity = 1;
    this.targetPlayer = null;
    this.giveResource = null;
    this.giveQuantity = 1;
    this.wantResource = null;
    this.wantQuantity = 1;
  },

  // Show incoming trade offer
  showIncomingOffer(offer) {
    console.log('Showing incoming offer:', offer);
    const modal = document.getElementById('tradeModal');

    // Hide all steps
    document.querySelectorAll('.trade-step').forEach(el => el.classList.add('hidden'));
    document.getElementById('tradeResult').classList.remove('hidden');

    // Build offer message with icons
    const giveIcon = this.resourceIcons[offer.give.type] || '📦';
    const wantIcon = this.resourceIcons[offer.want.type] || '📦';

    const offerMsg = `${offer.from} wants to trade:\n\nThey give: ${giveIcon} ${offer.give.amount} ${this.resourceNames[offer.give.type] || offer.give.type}\n\nYou give: ${wantIcon} ${offer.want.amount} ${this.resourceNames[offer.want.type] || offer.want.type}`;

    document.getElementById('resultIcon').textContent = '🤝';
    document.getElementById('resultTitle').textContent = 'Trade Offer';
    document.getElementById('resultMessage').style.whiteSpace = 'pre-line';
    document.getElementById('resultMessage').textContent = offerMsg;

    // Replace close button with accept/decline buttons
    const resultDiv = document.getElementById('tradeResult');
    const existingBtn = resultDiv.querySelector('.btn-primary');
    if (existingBtn) {
      existingBtn.style.display = 'none';
    }

    // Add offer buttons if they don't exist
    let btnContainer = resultDiv.querySelector('.offer-buttons');
    if (!btnContainer) {
      btnContainer = document.createElement('div');
      btnContainer.className = 'offer-buttons';
      btnContainer.style.cssText = 'display: flex; gap: 10px; margin-top: 20px;';
      btnContainer.innerHTML = `
        <button id="tradeOfferAccept" class="btn-primary" style="flex: 1; padding: 12px; border-radius: 6px; background: #1bb56d; color: #fff; font-weight: bold; border: none; cursor: pointer;">✓ Accept</button>
        <button id="tradeOfferDecline" class="btn-primary" style="flex: 1; padding: 12px; border-radius: 6px; background: #dc2626; color: #fff; font-weight: bold; border: none; cursor: pointer;">✗ Decline</button>
      `;
      resultDiv.querySelector('div').appendChild(btnContainer);
    }

    // Store offer for handlers
    modal.dataset.currentOffer = JSON.stringify(offer);

    // Show modal
    modal.classList.remove('hidden');
  }
};

// Track if already initialized to prevent duplicate listeners
let tradeModalInitialized = false;

// Initialize when DOM is ready and after a slight delay to ensure all elements are loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded - scheduling TradeModal.init()');
  setTimeout(() => {
    if (!tradeModalInitialized) {
      TradeModal.init();
      tradeModalInitialized = true;
    }
  }, 500); // Small delay to ensure client.js has finished setting up
});

// Also try to initialize on window load as backup
window.addEventListener('load', () => {
  console.log('window.load - checking if TradeModal needs init');
  if (!tradeModalInitialized) {
    console.log('Initializing TradeModal on window load');
    TradeModal.init();
    tradeModalInitialized = true;
  }
});
