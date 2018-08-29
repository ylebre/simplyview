window.simply = (function(simply) {

	/*** utility functions ****/	
	function throttle( callbackFunction, intervalTime ) {
		var eventId = 0;
		return function() {
			var myArguments = arguments;
			var me = this;
			if ( eventId ) {
				return;
			} else {
				eventId = window.setTimeout( function() {
					callbackFunction.apply(me, myArguments);
					eventId = 0;
				}, intervalTime );
			}
		}
	}

	function getElement(node) {
		if (node.nodeType != Node.ELEMENT_NODE) {
			return node.parentElement;
		}
		return node;
	}


	function getFieldType(fieldTypes, el) {
		var setters = Object.keys(fieldTypes);
		for(var i=setters.length-1;i>=0;i--) {
			if (el.matches(setters[i])) {
				return fieldTypes[setters[i]];
			}
		}
		return null;
	}

	function setValue(el, value, binding) {
		if (el!=focusedElement) {
			var fieldType = getFieldType(binding.fieldTypes, el);
			if (fieldType) {
				fieldType.set.call(el, (typeof value != 'undefined' ? value : ''));
				el.dispatchEvent(new Event('simply.bind.resolved', {
					bubbles: true,
					cancelable: false
				}));
			}
		}
	}

	function getValue(el, binding) {
		var setters = Object.keys(binding.fieldTypes);
		for(var i=setters.length-1;i>=0;i--) {
			if (el.matches(setters[i])) {
				return binding.fieldTypes[setters[i]].get.call(el);
			}
		}
	}

	/** FIXME: getPath should be configurable **/
	function getPath(el, attribute) {
		var attributes = attribute.split(',');
		for (var attr of attributes) {
			if (el.hasAttribute(attr)) {
				return el.getAttribute(attr);
			}
		}
		return null;
	}

	/*** shadow values ***/
	var shadows = new WeakMap();
	var focusedElement = null;
	/**
	 * Returns an object ment to keep the original value of model[jsonPath]
	 */
	function getShadow(model, jsonPath) {
		if (!shadows.has(model)) {
			shadows.set(model, {});
		}
		var root = shadows.get(model);
		if (typeof root[jsonPath] == 'undefined') {
			root[jsonPath] = {
				value: null,
				elements: [],
				children: {},
				listeners: []
			};
		}
		return root[jsonPath];
	}

	function triggerListeners(listeners, value) {
		listeners.forEach(function(callback) {
			callback.call(null, value);
		});
	}

	/**
	 * Returns true if a shadow for this path and rootModel exist
	 * This means that there is already a setter/getter pair for it.
	 **/
	function hasShadow(model, jsonPath) {
		if (!shadows.has(model)) {
			shadows.set(model, {});
		}
		var root = shadows.get(model);
		return typeof root[jsonPath] != 'undefined';
	}

	function Binding(config) {
		this.config = config;
		if (!this.config) {
			this.config = {};
		}
		if (!this.config.model) {
			this.config.model = {};
		}
		if (!this.config.attr) {
			this.config.attr = 'data-bind';
		}
		if (!this.config.selector) {
			this.config.selector = '[data-bind]';
		}
		this.fieldTypes = {
			'*': {
				set: function(value) {
					this.innerHTML = value;
				},
				get: function() {
					return this.innerHTML;
				}
			}
		};
		if (this.config.fieldTypes) {
			Object.assign(this.fieldTypes, this.config.fieldTypes);
		}
		this.attach(document.querySelectorAll(this.config.selector));
	};

	Binding.prototype.attach = function(elements) {
		var self = this;



		/**
		 * Attaches a binding to a specific html element.
		 **/
		var attachElement = function(jsonPath, el) {
			if (!document.body.contains(el)) {
				// element is no longer part of the document
				// so don't bother changing the model or updating the element for it
				return;
			}
			//FIXME: allow different property instead of 'data-bind'
			var nested = el.parentElement.closest('[data-bind="'+el.dataset.bind+'"]');
			if (nested && !fieldAllowsNesting(nested)) {
				console.log('Error: illegal nested data-binding found for '+el.dataset.bind);
				console.log(el);
				return;
			}
			var keys       = jsonPath.split('.'),
			    parentPath = '',
			    path       = '',
			    shadow,
			    model      = self.config.model;

			do {
				key    = keys.shift();
				path   = simply.path.push(path, key);
				shadow = getShadow(self.config.model, path);
				if (keys.length) {
					shadow.children[ simply.path.push(path,keys[0]) ] = true;
				}
				if (model && typeof model == 'object') {
					shadow.value = model[key];
					Object.defineProperty(model, key, {
						set: (function(shadow, path) {
							return function(value) {
								shadow.value = value;
								updateElements(shadow.elements, value);
								attachChildren(shadow);
								addSetTriggers(shadow);
								updateParents(path);
								monitorProperties(value, path);
								triggerListeners(shadow.listeners, value);
							};
						})(shadow, path),
						get: (function(shadow) {
							return function() {
								return shadow.value;
							}
						})(shadow),
						configurable: true,
						enumerable: true
					});
					model = model[key];
				}
				parentPath = path;
			} while(keys.length);
			if (shadow.elements.indexOf(el)==-1) {
				shadow.elements.push(el);
			}
			initElement(el);
			updateElements([el], model);
			monitorProperties(model, path);
		};

		var fieldAllowsNesting = function(el) {
			var fieldType = getFieldType(self.fieldTypes, el);
			return fieldType && fieldType.allowNesting;
		};

		/**
		 * This will call updateElements on all parents of jsonPath that are
		 * bound to some elements.
		 **/
		var updateParents = function(jsonPath) {
			var parents = simply.path.parents(jsonPath);
			parents.pop();
			parents.reverse().forEach(function(parent) {
				shadow = getShadow(self.config.model, parent);
				if (shadow && shadow.elements.length) {
					updateElements(shadow.elements, shadow.value);
				}
			});
		};

		/**
		 * This defines setters/getters for properties that aren't bound
		 * to elements directly, but who have a parent object that is.
		 **/
		var monitorProperties = function(model, path) {
			if (!model || typeof model != 'object') {
				return;
			}

			var _shadow = {};
			Object.keys(model).forEach(function(property) {
				if (!hasShadow(self.config.model, simply.path.push(path,property))) {
					// If the property has a shadow, then it is already bound
					// and has a setter that will call updateParents
					_shadow[property] = model[property];
					Object.defineProperty(model, property, {
						set: function(value) {
							_shadow[property] = value;
							updateParents(path);
						},
						get: function() {
							return _shadow[property];
						},
						configurable: true,
						enumerable: true
					});
				}
				if (model[property] && typeof model[property] == 'object') {
					monitorProperties(model[property], simply.path.push(path,property));
				}
			});
		}
		
		/**
		 * Runs the init() method of the fieldType, if it is defined.
		 **/
		var initElement = function(el) {
			var selectors = Object.keys(self.fieldTypes);
			for (var i=selectors.length-1; i>=0; i--) {
				if (self.fieldTypes[selectors[i]].init && el.matches(selectors[i])) {
					self.fieldTypes[selectors[i]].init.call(el, self);
					return;
				}
			}
		};

		/**
		 * Updates the given elements with the new value, if the element is still
		 * in the document.body. Otherwiste it will remove the element from the
		 * elements list. During the update the observer is paused.
		 **/
		var updateElements = function(elements, value) {
			var reconnectObserver;
			if (self.observing) {
				self.observer.disconnect();
				self.observing = false;
				reconnectObserver = true;
			}
			elements.forEach(function(el, index) {
				if (document.body.contains(el)) {
					setValue(el, value, self);
					var children = el.querySelectorAll(self.config.selector);
					if (children.length) {
						self.attach(children);
					}
				} else {
					elements.splice(index,1);
				}
			});
			if (reconnectObserver) {
		        self.observing = true;
				self.observer.observe(document.body, {
		        	subtree: true,
		        	childList: true,
		        	characterData: true,
		        	attributes: true	
		        });
		    }
		};

		/**
		 * Loops over registered children of the shadow, that means a sub property
		 * is bound to an element, and reattaches those to their elements with the
		 * new values.
		 **/
		var attachChildren = function( shadow) {
			Object.keys(shadow.children).forEach(function(child) {
				var value = simply.path.get(self.config.model, child);
				var childShadow = getShadow(self.config.model, child);
				childShadow.value = value;
				childShadow.elements.forEach(function(el) {
					attachElement(child, el);
				});
			});
		};

		/**
		 * Adds a setter for all bound child properties that restores the bindings
		 * when a new value is set for them. This is to restore bindings after a
		 * parent value is changed so the original property is no longer set.
		 * It is not enumerable, so it won't show up in Object.keys or JSON.stringify
		 **/
		var addSetTriggers = function(shadow){
			Object.keys(shadow.children).forEach(function(childPath) {
				var name = simply.path.pop(childPath);
				if (shadow.value && typeof shadow.value[name] == 'undefined') {
					Object.defineProperty(shadow.value, name, {
						set: function(value) {
							restoreBinding(childPath);
							shadow.value[name] = value;
						},
						configurable: true,
						enumerable: false
					});
				}
			});
		}

		/**
		 * Restores the binding for all registered bound elements.
		 * Run when the set trigger is called.
		 **/
		var restoreBinding = function(path) {
			var shadow = getShadow(self.config.model, path);
			[].forEach.call(shadow.elements, function(element) {
            	attachElement(path, element);
        	});
		}

		if ( elements instanceof HTMLElement ) {
			elements = [ elements ];
		}
		[].forEach.call(elements, function(element) {
            var key = getPath(element, self.config.attribute);
            attachElement(key, element);
        });
        document.body.addEventListener('simply.bind.update', function(evt) {
			focusedElement = evt.target;
			simply.path.set(self.config.model, getPath(evt.target, self.config.attribute), getValue(evt.target, self));
			focusedElement = null;
        }, true);
	};

	var runWhenIdle = (function() {
		if (window.requestIdleCallback) {
			return function(callback) {
				window.requestIdleCallback(callback, {timeout: 500});
			};
		}
		return window.requestAnimationFrame;
	})();

	Binding.prototype.observe = function(root) {
		var changes = [];
		var self    = this;

		var handleChanges = throttle(function() {
			runWhenIdle(function() {
				changes = changes.concat(self.observer.takeRecords());
				self.observer.disconnect();
				self.observing = false;
				var change,el,children;
				var handledKeys = {}; // list of keys already handled
				var handledElements = new WeakMap();
				for (var i=changes.length-1; i>=0; i--) {
					// handle last change first, so programmatic changes are predictable
					// last change overrides earlier changes
					change = changes[i];
					el = getElement(change.target);
					if (!el) {
						continue;
					}
					if (handledElements.has(el)) {
						continue;
					}
					handledElements.set(el, true);
					children = el.querySelectorAll(self.config.selector);
					if (children.length) {
						self.attach(children);
					}
					if (!el.matches(self.config.selector)) {
						el = el.closest(self.config.selector);
					}
					if (el) {
						var key = getPath(el, self.config.attribute);
						if (handledKeys[key]) {
							// we already handled this key, the model is uptodate
							continue;
						}
						handledKeys[key] = true;
						focusedElement = el;
						simply.path.set(self.config.model, key, getValue(el, self));
						focusedElement = null;
					}
				}
				changes = [];
				self.observing = true;
				self.observer.observe(root, {
		        	subtree: true,
		        	childList: true,
		        	characterData: true,
		        	attributes: true				
				});
			});
		},100);
        this.observer = new MutationObserver(function(changeList) {
        	changes = changes.concat(changeList);
        	handleChanges();
        });
        this.observing = true;
        this.observer.observe(root, {
        	subtree: true,
        	childList: true,
        	characterData: true,
        	attributes: true	
        });
        return this;
	};

	Binding.prototype.stopObserver = function() {
		this.observer.disconnect();
		this.observing = false;
	};

	Binding.prototype.addListener = function(jsonPath, callback) {
		var shadow = getShadow(this.config.model, jsonPath);
		shadow.listeners.push(callback);
	};

	Binding.prototype.removeListener = function(jsonPath, callback) {
		var shadow = getShadow(this.config.model, jsonPath);
		shadow.listeners = shadow.listeners.filter(function(listener) {
			if (listener==callback) {
				return false;
			}
			return true;
		});
	};

	simply.bind = function(config) {
		return new Binding(config);
	};

    return simply;
})(window.simply || {});