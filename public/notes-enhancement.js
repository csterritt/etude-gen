/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/*
 * Issue 15: Progressive enhancement for duration toggles and Select all.
 *
 * This script is a strictly additive enhancement. It:
 * - Computes which duration toggles must not be deselected (because doing so
 *   would leave no eligible complete-measure pattern) and marks them with
 *   aria-disabled="true" (never the native disabled attribute).
 * - Associates each disabled toggle's reason text via aria-describedby to
 *   visible text in the DOM, never a title attribute or colour alone.
 * - Announces state changes through a polite live region.
 * - Enhances Select all to check every pitch in place without a server round
 *   trip.
 *
 * If the script fails to load or initialize, every duration toggle stays
 * fully usable and the Issue 14 server rejection is the only guard. The
 * script adds no client-side authority over validation, ownership, or
 * persisted state.
 */
(function () {
  'use strict'

  try {
    // --- Read the embedded rhythm data -----------------------------------

    var dataEl = document.getElementById('notes-rhythm-data')
    if (!dataEl) return
    var data = JSON.parse(dataEl.textContent)
    if (!data || !Array.isArray(data.patterns)) return
    var patterns = data.patterns
    var meter = data.meter || ''

    // --- Locate DOM elements --------------------------------------------

    var durationCheckboxes = document.querySelectorAll('input[name="durations"]')
    var pitchCheckboxes = document.querySelectorAll('input[name="pitches"]')
    var liveRegion = document.querySelector('[data-testid="duration-live-region"]')
    var selectAllBtn = document.querySelector('[data-testid="notes-select-all-action"]')

    if (durationCheckboxes.length === 0) return

    // --- Duration display labels (mirrors DURATION_LABELS) ---------------

    var DURATION_LABELS = {
      W: 'whole',
      H: 'half',
      D: 'dotted half',
      Q: 'quarter',
      R: 'dotted quarter',
      E: 'eighth',
    }

    var CANONICAL_ORDER = ['W', 'H', 'D', 'Q', 'R', 'E']

    // --- Pure helpers (mirror src/lib/duration-disabled-set.ts) ---------

    var hasEligiblePattern = function (tokenSet) {
      for (var i = 0; i < patterns.length; i += 1) {
        var pattern = patterns[i]
        if (!pattern) continue
        var allSelected = true
        for (var j = 0; j < pattern.length; j += 1) {
          if (!tokenSet[pattern[j]]) {
            allSelected = false
            break
          }
        }
        if (allSelected) return true
      }
      return false
    }

    var getCheckedTokens = function () {
      var set = {}
      for (var i = 0; i < durationCheckboxes.length; i += 1) {
        var cb = durationCheckboxes[i]
        if (cb.checked) {
          set[cb.value] = true
        }
      }
      return set
    }

    var computeDisabled = function () {
      var checked = getCheckedTokens()
      var disabled = []
      for (var key in checked) {
        if (!Object.prototype.hasOwnProperty.call(checked, key)) continue
        var reduced = {}
        for (var k in checked) {
          if (k !== key) reduced[k] = true
        }
        if (!hasEligiblePattern(reduced)) {
          disabled.push(key)
        }
      }
      return CANONICAL_ORDER.filter(function (t) {
        return disabled.indexOf(t) >= 0
      })
    }

    // --- Apply disabled state to the DOM --------------------------------

    var previousDisabled = []

    var applyDisabled = function () {
      var disabled = computeDisabled()
      var disabledSet = {}
      for (var i = 0; i < disabled.length; i += 1) {
        disabledSet[disabled[i]] = true
      }

      for (var j = 0; j < durationCheckboxes.length; j += 1) {
        var cb = durationCheckboxes[j]
        var token = cb.value
        var reasonId = 'duration-reason-' + token
        var reasonEl = document.getElementById(reasonId)

        if (disabledSet[token]) {
          cb.setAttribute('aria-disabled', 'true')
          if (reasonEl) {
            var label = DURATION_LABELS[token] || token
            reasonEl.textContent =
              'The ' + label + ' duration is required because removing it would leave no complete measure for the ' + meter + ' meter.'
          }
          // Wire aria-describedby to the reason element (set, not append,
          // since the individual checkboxes have no server-rendered
          // aria-describedby).
          cb.setAttribute('aria-describedby', reasonId)
        } else {
          cb.removeAttribute('aria-disabled')
          if (reasonEl) {
            reasonEl.textContent = ''
          }
          cb.removeAttribute('aria-describedby')
        }
      }

      // Announce changes through the polite live region.
      if (liveRegion) {
        var newlyDisabled = []
        var newlyEnabled = []
        for (var n = 0; n < disabled.length; n += 1) {
          if (previousDisabled.indexOf(disabled[n]) < 0) {
            newlyDisabled.push(disabled[n])
          }
        }
        for (var m = 0; m < previousDisabled.length; m += 1) {
          if (disabled.indexOf(previousDisabled[m]) < 0) {
            newlyEnabled.push(previousDisabled[m])
          }
        }
        var messages = []
        for (var p = 0; p < newlyDisabled.length; p += 1) {
          var dLabel = DURATION_LABELS[newlyDisabled[p]] || newlyDisabled[p]
          messages.push('The ' + dLabel + ' duration is now required.')
        }
        for (var q = 0; q < newlyEnabled.length; q += 1) {
          var eLabel = DURATION_LABELS[newlyEnabled[q]] || newlyEnabled[q]
          messages.push('The ' + eLabel + ' duration is no longer required.')
        }
        if (messages.length > 0) {
          liveRegion.textContent = messages.join(' ')
        }
      }

      previousDisabled = disabled
    }

    // --- Intercept clicks on disabled toggles ---------------------------

    for (var i = 0; i < durationCheckboxes.length; i += 1) {
      // Prevent deselection of an aria-disabled toggle. preventDefault on
      // the click event stops the checkbox from toggling, for both mouse
      // and keyboard (spacebar) activation.
      durationCheckboxes[i].addEventListener('click', function (event) {
        if (this.getAttribute('aria-disabled') === 'true') {
          event.preventDefault()
        }
      })
      // Recompute the disabled set after any successful toggle change.
      durationCheckboxes[i].addEventListener('change', applyDisabled)
    }

    // --- Enhance Select all (no server round trip) ----------------------

    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', function (event) {
        event.preventDefault()
        for (var k = 0; k < pitchCheckboxes.length; k += 1) {
          pitchCheckboxes[k].checked = true
        }
      })
    }

    // --- Apply the disabled set on first paint --------------------------

    applyDisabled()
  } catch (err) {
    // Graceful failure: do nothing. Every duration toggle stays fully
    // usable and the Issue 14 server rejection is the only guard.
  }
})()
