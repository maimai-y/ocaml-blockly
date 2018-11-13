/**
 * @license
 * Visual Blocks Editor
 *
 * Copyright 2011 Google Inc.
 * https://developers.google.com/blockly/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview The class representing one block.
 * @author fraser@google.com (Neil Fraser)
 */
'use strict';

goog.provide('Blockly.Block');

goog.require('Blockly.Blocks');
goog.require('Blockly.Comment');
goog.require('Blockly.Connection');
goog.require('Blockly.Events.BlockChange');
goog.require('Blockly.Events.BlockCreate');
goog.require('Blockly.Events.BlockDelete');
goog.require('Blockly.Events.BlockMove');
goog.require('Blockly.Extensions');
goog.require('Blockly.Input');
goog.require('Blockly.Mutator');
goog.require('Blockly.BoundVariableValue');
goog.require('Blockly.Workbench');
goog.require('Blockly.Warning');
goog.require('Blockly.Workspace');
goog.require('Blockly.Xml');
goog.require('goog.array');
goog.require('goog.asserts');
goog.require('goog.math.Coordinate');
goog.require('goog.string');


/**
 * Class for one block.
 * Not normally called directly, workspace.newBlock() is preferred.
 * @param {!Blockly.Workspace} workspace The block's workspace.
 * @param {?string} prototypeName Name of the language object containing
 *     type-specific functions for this block.
 * @param {string=} opt_id Optional ID.  Use this ID if provided, otherwise
 *     create a new ID.
 * @constructor
 */
Blockly.Block = function(workspace, prototypeName, opt_id) {
  if (typeof Blockly.Generator.prototype[prototypeName] !== 'undefined') {
    console.warn('FUTURE ERROR: Block prototypeName "' + prototypeName
        + '" conflicts with Blockly.Generator members. Registering Generators '
        + 'for this block type will incur errors.'
        + '\nThis name will be DISALLOWED (throwing an error) in future '
        + 'versions of Blockly.');
  }

  /** @type {string} */
  this.id = (opt_id && !workspace.getBlockById(opt_id)) ?
      opt_id : Blockly.utils.genUid();
  workspace.blockDB_[this.id] = this;
  /** @type {Blockly.Connection} */
  this.outputConnection = null;
  /** @type {Blockly.Connection} */
  this.nextConnection = null;
  /** @type {Blockly.Connection} */
  this.previousConnection = null;
  /** @type {!Array.<!Blockly.Input>} */
  this.inputList = [];
  /** @type {!Object<string, !Blockly.BoundVariableValue>} */
  this.typedValue = {};
  /** @type {boolean|undefined} */
  this.inputsInline = undefined;
  /** @type {boolean} */
  this.disabled = false;
  /** @type {string|!Function} */
  this.tooltip = '';
  /** @type {boolean} */
  this.contextMenu = true;

  /**
   * @type {Blockly.Block}
   * @protected
   */
  this.parentBlock_ = null;

  /**
   * @type {!Array.<!Blockly.Block>}
   * @protected
   */
  this.childBlocks_ = [];

  /**
   * @type {boolean}
   * @private
   */
  this.deletable_ = true;

  /**
   * @type {boolean}
   * @private
   */
  this.movable_ = true;

  /**
   * @type {boolean}
   * @private
   */
  this.editable_ = true;

  /**
   * @type {boolean}
   * @private
   */
  this.isShadow_ = false;

  /**
   * @type {boolean}
   * @protected
   */
  this.collapsed_ = false;

  /**
   * @type {boolean}
   * @private
   */
  this.transferable_ = false;

  /** @type {string|Blockly.Comment} */
  this.comment = null;

  /**
   * The block's position in workspace units.  (0, 0) is at the workspace's
   * origin; scale does not change this value.
   * @type {!goog.math.Coordinate}
   * @private
   */
  this.xy_ = new goog.math.Coordinate(0, 0);

  /** @type {!Blockly.Workspace} */
  this.workspace = workspace;
  /** @type {boolean} */
  this.isInFlyout = workspace.isFlyout;
  /** @type {boolean} */
  this.isInMutator = workspace.isMutator;

  /** @type {boolean} */
  this.RTL = workspace.RTL;

  // Copy the type-specific functions and data from the prototype.
  if (prototypeName) {
    /** @type {string} */
    this.type = prototypeName;
    var prototype = Blockly.Blocks[prototypeName];
    goog.asserts.assertObject(prototype,
        'Error: Unknown block type "%s".', prototypeName);
    goog.mixin(this, prototype);
  }

  workspace.addTopBlock(this);

  // Call an initialization function, if it exists.
  if (goog.isFunction(this.init)) {
    this.init();
  }
  // Record initial inline state.
  /** @type {boolean|undefined} */
  this.inputsInlineDefault = this.inputsInline;

  // Fire a create event.
  if (Blockly.Events.isEnabled()) {
    var existingGroup = Blockly.Events.getGroup();
    if (!existingGroup) {
      Blockly.Events.setGroup(true);
    }
    try {
      Blockly.Events.fire(new Blockly.Events.BlockCreate(this));
    } finally {
      if (!existingGroup) {
        Blockly.Events.setGroup(false);
      }
    }

  }
  // Bind an onchange function, if it exists.
  if (goog.isFunction(this.onchange)) {
    this.setOnChange(this.onchange);
  }
};

/**
 * Obtain a newly created block.
 * @param {!Blockly.Workspace} workspace The block's workspace.
 * @param {?string} prototypeName Name of the language object containing
 *     type-specific functions for this block.
 * @return {!Blockly.Block} The created block.
 * @deprecated December 2015
 */
Blockly.Block.obtain = function(workspace, prototypeName) {
  console.warn('Deprecated call to Blockly.Block.obtain, ' +
               'use workspace.newBlock instead.');
  return workspace.newBlock(prototypeName);
};

/**
 * Optional text data that round-trips beween blocks and XML.
 * Has no effect. May be used by 3rd parties for meta information.
 * @type {?string}
 */
Blockly.Block.prototype.data = null;

/**
 * Colour of the block in '#RRGGBB' format.
 * @type {string}
 * @private
 */
Blockly.Block.prototype.colour_ = '#000000';

/**
 * Colour of the block as HSV hue value (0-360)
 * @type {?number}
 * @private
  */
Blockly.Block.prototype.hue_ = null;

/**
 * Dispose of this block.
 * @param {boolean} healStack If true, then try to heal any gap by connecting
 *     the next statement with the previous statement.  Otherwise, dispose of
 *     all children of this block.
 */
Blockly.Block.prototype.dispose = function(healStack) {
  if (!this.workspace) {
    // Already deleted.
    return;
  }
  // Terminate onchange event calls.
  if (this.onchangeWrapper_) {
    this.workspace.removeChangeListener(this.onchangeWrapper_);
  }
  this.unplug(healStack);
  if (Blockly.Events.isEnabled()) {
    Blockly.Events.fire(new Blockly.Events.BlockDelete(this));
  }
  Blockly.Events.disable();

  try {
    // This block is now at the top of the workspace.
    // Remove this block from the workspace's list of top-most blocks.
    if (this.workspace) {
      this.workspace.removeTopBlock(this);
      // Remove from block database.
      delete this.workspace.blockDB_[this.id];
      this.workspace = null;
    }

    // Just deleting this block from the DOM would result in a memory leak as
    // well as corruption of the connection database.  Therefore we must
    // methodically step through the blocks and carefully disassemble them.

    if (Blockly.selected == this) {
      Blockly.selected = null;
    }

    // First, dispose of all my children.
    for (var i = this.childBlocks_.length - 1; i >= 0; i--) {
      this.childBlocks_[i].dispose(false);
    }
    // Then dispose of myself.
    // Dispose of all inputs and their fields.
    for (var i = 0, input; input = this.inputList[i]; i++) {
      input.dispose();
    }
    this.inputList.length = 0;
    // Dispose of any remaining connections (next/previous/output).
    var connections = this.getConnections_(true);
    for (var i = 0; i < connections.length; i++) {
      var connection = connections[i];
      if (connection.isConnected()) {
        connection.disconnect();
      }
      connections[i].dispose();
    }

    // Dispose all of values.
    var fieldNames = Object.keys(this.typedValue);
    for (var i = 0, name; name = fieldNames[i]; i++) {
      this.typedValue[name].dispose();
    }
  } finally {
    Blockly.Events.enable();
  }
};

/**
 * Call initModel on all fields on the block.
 * May be called more than once.
 * Either initModel or initSvg must be called after creating a block and before
 * the first interaction with it.  Interactions include UI actions
 * (e.g. clicking and dragging) and firing events (e.g. create, delete, and
 * change).
 * @public
 */
Blockly.Block.prototype.initModel = function() {
  for (var i = 0, input; input = this.inputList[i]; i++) {
    for (var j = 0, field; field = input.fieldRow[j]; j++) {
      if (field.initModel) {
        field.initModel();
      }
    }
  }
};

/**
 * Unplug this block from its superior block.  If this block is a statement,
 * optionally reconnect the block underneath with the block on top.
 * @param {boolean=} opt_healStack Disconnect child statement and reconnect
 *   stack.  Defaults to false.
 */
Blockly.Block.prototype.unplug = function(opt_healStack) {
  if (this.outputConnection) {
    if (this.outputConnection.isConnected()) {
      // Disconnect from any superior block.
      this.outputConnection.disconnect();
    }
  } else if (this.previousConnection) {
    var previousTarget = null;
    if (this.previousConnection.isConnected()) {
      // Remember the connection that any next statements need to connect to.
      previousTarget = this.previousConnection.targetConnection;
      // Detach this block from the parent's tree.
      this.previousConnection.disconnect();
    }
    var nextBlock = this.getNextBlock();
    if (opt_healStack && nextBlock) {
      // Disconnect the next statement.
      var nextTarget = this.nextConnection.targetConnection;
      nextTarget.disconnect();
      if (previousTarget && previousTarget.checkType_(nextTarget)) {
        // Attach the next statement to the previous statement.
        previousTarget.connect(nextTarget);
      }
    }
  }
};

/**
 * Returns all connections originating from this block.
 * @param {boolean} _all If true, return all connections even hidden ones.
 * @return {!Array.<!Blockly.Connection>} Array of connections.
 * @private
 */
Blockly.Block.prototype.getConnections_ = function(_all) {
  var myConnections = [];
  if (this.outputConnection) {
    myConnections.push(this.outputConnection);
  }
  if (this.previousConnection) {
    myConnections.push(this.previousConnection);
  }
  if (this.nextConnection) {
    myConnections.push(this.nextConnection);
  }
  for (var i = 0, input; input = this.inputList[i]; i++) {
    if (input.connection) {
      myConnections.push(input.connection);
    }
  }
  return myConnections;
};

/**
 * Walks down a stack of blocks and finds the last next connection on the stack.
 * @return {Blockly.Connection} The last next connection on the stack, or null.
 * @package
 */
Blockly.Block.prototype.lastConnectionInStack = function() {
  var nextConnection = this.nextConnection;
  while (nextConnection) {
    var nextBlock = nextConnection.targetBlock();
    if (!nextBlock) {
      // Found a next connection with nothing on the other side.
      return nextConnection;
    }
    nextConnection = nextBlock.nextConnection;
  }
  // Ran out of next connections.
  return null;
};

/**
 * Bump unconnected blocks out of alignment.  Two blocks which aren't actually
 * connected should not coincidentally line up on screen.
 * @protected
 */
Blockly.Block.prototype.bumpNeighbours_ = function() {
  console.warn('Not expected to reach this bumpNeighbours_ function. The ' +
    'BlockSvg function for bumpNeighbours_ was expected to be called instead.');
};

/**
 * Return the parent block or null if this block is at the top level.
 * @return {Blockly.Block} The block that holds the current block.
 */
Blockly.Block.prototype.getParent = function() {
  // Look at the DOM to see if we are nested in another block.
  return this.parentBlock_;
};

/**
 * Return the input that connects to the specified block.
 * @param {!Blockly.Block} block A block connected to an input on this block.
 * @return {Blockly.Input} The input that connects to the specified block.
 */
Blockly.Block.prototype.getInputWithBlock = function(block) {
  for (var i = 0, input; input = this.inputList[i]; i++) {
    if (input.connection && input.connection.targetBlock() == block) {
      return input;
    }
  }
  return null;
};

/**
 * Return the parent block that surrounds the current block, or null if this
 * block has no surrounding block.  A parent block might just be the previous
 * statement, whereas the surrounding block is an if statement, while loop, etc.
 * @return {Blockly.Block} The block that surrounds the current block.
 */
Blockly.Block.prototype.getSurroundParent = function() {
  var block = this;
  do {
    var prevBlock = block;
    block = block.getParent();
    if (!block) {
      // Ran off the top.
      return null;
    }
  } while (block.getNextBlock() == prevBlock);
  // This block is an enclosing parent, not just a statement in a stack.
  return block;
};

/**
 * Return the next statement block directly connected to this block.
 * @return {Blockly.Block} The next statement block or null.
 */
Blockly.Block.prototype.getNextBlock = function() {
  return this.nextConnection && this.nextConnection.targetBlock();
};

/**
 * Return the top-most block in this block's tree.
 * This will return itself if this block is at the top level.
 * @return {!Blockly.Block} The root block.
 */
Blockly.Block.prototype.getRootBlock = function() {
  var rootBlock;
  var block = this;
  do {
    rootBlock = block;
    block = rootBlock.parentBlock_;
  } while (block);
  return rootBlock;
};

/**
 * Find all the blocks that are directly nested inside this one.
 * Includes value and statement inputs, as well as any following statement.
 * Excludes any connection on an output tab or any preceding statement.
 * Blocks are optionally sorted by position; top to bottom.
 * @param {boolean} ordered Sort the list if true.
 * @return {!Array.<!Blockly.Block>} Array of blocks.
 */
Blockly.Block.prototype.getChildren = function(ordered) {
  if (!ordered) {
    return this.childBlocks_;
  }
  var blocks = [];
  for (var i = 0, input; input = this.inputList[i]; i++) {
    if (input.connection) {
      var child = input.connection.targetBlock();
      if (child) {
        blocks.push(child);
      }
    }
  }
  var next = this.getNextBlock();
  if (next) {
    blocks.push(next);
  }
  return blocks;
};

/**
 * Set parent of this block to be a new block or null.
 * @param {Blockly.Block} newParent New parent block.
 */
Blockly.Block.prototype.setParent = function(newParent) {
  if (newParent == this.parentBlock_) {
    return;
  }
  if (this.parentBlock_) {
    // Remove this block from the old parent's child list.
    goog.array.remove(this.parentBlock_.childBlocks_, this);

    // Disconnect from superior blocks.
    if (this.previousConnection && this.previousConnection.isConnected()) {
      throw 'Still connected to previous block.';
    }
    if (this.outputConnection && this.outputConnection.isConnected()) {
      throw 'Still connected to parent block.';
    }
    this.parentBlock_ = null;
    // This block hasn't actually moved on-screen, so there's no need to update
    // its connection locations.
  } else {
    // Remove this block from the workspace's list of top-most blocks.
    this.workspace.removeTopBlock(this);
  }

  this.parentBlock_ = newParent;
  if (newParent) {
    // Add this block to the new parent's child list.
    newParent.childBlocks_.push(this);
  } else {
    this.workspace.addTopBlock(this);
  }
};

/**
 * Find all the blocks that are directly or indirectly nested inside this one.
 * Includes this block in the list.
 * Includes value and statement inputs, as well as any following statements.
 * Excludes any connection on an output tab or any preceding statements.
 * Blocks are optionally sorted by position; top to bottom.
 * @param {boolean} ordered Sort the list if true.
 * @return {!Array.<!Blockly.Block>} Flattened array of blocks.
 */
Blockly.Block.prototype.getDescendants = function(ordered) {
  var blocks = [this];
  var childBlocks = this.getChildren(ordered);
  for (var child, i = 0; child = childBlocks[i]; i++) {
    blocks.push.apply(blocks, child.getDescendants(ordered));
  }
  return blocks;
};

/**
 * Get whether this block is deletable or not.
 * @return {boolean} True if deletable.
 */
Blockly.Block.prototype.isDeletable = function() {
  return this.deletable_ && !this.isShadow_ &&
      !(this.workspace && this.workspace.options.readOnly);
};

/**
 * Set whether this block is deletable or not.
 * @param {boolean} deletable True if deletable.
 */
Blockly.Block.prototype.setDeletable = function(deletable) {
  this.deletable_ = deletable;
};

/**
 * Get whether this block is movable or not.
 * @return {boolean} True if movable.
 */
Blockly.Block.prototype.isMovable = function() {
  return this.movable_ && !this.isShadow_ &&
      !(this.workspace && this.workspace.options.readOnly);
};

/**
 * Set whether this block is movable or not.
 * @param {boolean} movable True if movable.
 */
Blockly.Block.prototype.setMovable = function(movable) {
  this.movable_ = movable;
};

/**
 * Get whether this block is a shadow block or not.
 * @return {boolean} True if a shadow.
 */
Blockly.Block.prototype.isShadow = function() {
  return this.isShadow_;
};

/**
 * Set whether this block is a shadow block or not.
 * @param {boolean} shadow True if a shadow.
 */
Blockly.Block.prototype.setShadow = function(shadow) {
  this.isShadow_ = shadow;
};

/**
 * Get whether this block is editable or not.
 * @return {boolean} True if editable.
 */
Blockly.Block.prototype.isEditable = function() {
  return this.editable_ && !(this.workspace && this.workspace.options.readOnly);
};

/**
 * Set whether this block is editable or not.
 * @param {boolean} editable True if editable.
 */
Blockly.Block.prototype.setEditable = function(editable) {
  this.editable_ = editable;
  for (var i = 0, input; input = this.inputList[i]; i++) {
    for (var j = 0, field; field = input.fieldRow[j]; j++) {
      field.updateEditable();
    }
  }
};

/**
 * Set whether the connections are hidden (not tracked in a database) or not.
 * Recursively walk down all child blocks (except collapsed blocks).
 * @param {boolean} hidden True if connections are hidden.
 */
Blockly.Block.prototype.setConnectionsHidden = function(hidden) {
  if (!hidden && this.isCollapsed()) {
    if (this.outputConnection) {
      this.outputConnection.setHidden(hidden);
    }
    if (this.previousConnection) {
      this.previousConnection.setHidden(hidden);
    }
    if (this.nextConnection) {
      this.nextConnection.setHidden(hidden);
      var child = this.nextConnection.targetBlock();
      if (child) {
        child.setConnectionsHidden(hidden);
      }
    }
  } else {
    var myConnections = this.getConnections_(true);
    for (var i = 0, connection; connection = myConnections[i]; i++) {
      connection.setHidden(hidden);
      if (connection.isSuperior()) {
        var child = connection.targetBlock();
        if (child) {
          child.setConnectionsHidden(hidden);
        }
      }
    }
  }
};

/**
 * Set the URL of this block's help page.
 * @param {string|Function} url URL string for block help, or function that
 *     returns a URL.  Null for no help.
 */
Blockly.Block.prototype.setHelpUrl = function(url) {
  this.helpUrl = url;
};

/**
 * Change the tooltip text for a block.
 * @param {string|!Function} newTip Text for tooltip or a parent element to
 *     link to for its tooltip.  May be a function that returns a string.
 */
Blockly.Block.prototype.setTooltip = function(newTip) {
  this.tooltip = newTip;
};

/**
 * Get the colour of a block.
 * @return {string} #RRGGBB string.
 */
Blockly.Block.prototype.getColour = function() {
  return this.colour_;
};

/**
 * Get the HSV hue value of a block. Null if hue not set.
 * @return {?number} Hue value (0-360)
 */
Blockly.Block.prototype.getHue = function() {
  return this.hue_;
};

/**
 * Change the colour of a block.
 * @param {number|string} colour HSV hue value (0 to 360), #RRGGBB string,
 *     or a message reference string pointing to one of those two values.
 */
Blockly.Block.prototype.setColour = function(colour) {
  var dereferenced = goog.isString(colour) ?
      Blockly.utils.replaceMessageReferences(colour) : colour;

  var hue = Number(dereferenced);
  if (!isNaN(hue) && 0 <= hue && hue <= 360) {
    this.hue_ = hue;
    this.colour_ = Blockly.hueToRgb(hue);
  } else if (goog.isString(dereferenced) &&
      /^#[0-9a-fA-F]{6}$/.test(dereferenced)) {
    this.colour_ = dereferenced;
    // Only store hue if colour is set as a hue.
    this.hue_ = null;
  } else {
    var errorMsg = 'Invalid colour: "' + dereferenced + '"';
    if (colour != dereferenced) {
      errorMsg += ' (from "' + colour + '")';
    }
    throw errorMsg;
  }
};

/**
 * Sets a callback function to use whenever the block's parent workspace
 * changes, replacing any prior onchange handler. This is usually only called
 * from the constructor, the block type initializer function, or an extension
 * initializer function.
 * @param {function(Blockly.Events.Abstract)} onchangeFn The callback to call
 *     when the block's workspace changes.
 * @throws {Error} if onchangeFn is not falsey or a function.
 */
Blockly.Block.prototype.setOnChange = function(onchangeFn) {
  if (onchangeFn && !goog.isFunction(onchangeFn)) {
    throw new Error("onchange must be a function.");
  }
  if (this.onchangeWrapper_) {
    this.workspace.removeChangeListener(this.onchangeWrapper_);
  }
  this.onchange = onchangeFn;
  if (this.onchange) {
    this.onchangeWrapper_ = onchangeFn.bind(this);
    this.workspace.addChangeListener(this.onchangeWrapper_);
  }
};

/**
 * Returns the named field from a block.
 * @param {string} name The name of the field.
 * @return {Blockly.Field} Named field, or null if field does not exist.
 */
Blockly.Block.prototype.getField = function(name) {
  for (var i = 0, input; input = this.inputList[i]; i++) {
    for (var j = 0, field; field = input.fieldRow[j]; j++) {
      if (field.name === name) {
        return field;
      }
    }
  }
  return null;
};

/**
 * Return all variables referenced by this block.
 * @return {!Array.<string>} List of variable names.
 * @package
 */
Blockly.Block.prototype.getVars = function() {
  var vars = [];
  for (var i = 0, input; input = this.inputList[i]; i++) {
    for (var j = 0, field; field = input.fieldRow[j]; j++) {
      if (field.referencesVariables() == Blockly.FIELD_VARIABLE_DEFAULT) {
        vars.push(field.getValue());
      }
    }
  }
  return vars;
};

/**
 * Return all variables referenced by this block.
 * @return {!Array.<!Blockly.VariableModel>} List of variable models.
 * @package
 */
Blockly.Block.prototype.getVarModels = function() {
  var vars = [];
  for (var i = 0, input; input = this.inputList[i]; i++) {
    for (var j = 0, field; field = input.fieldRow[j]; j++) {
      if (field.referencesVariables() == Blockly.FIELD_VARIABLE_DEFAULT) {
        var model = this.workspace.getVariableById(field.getValue());
        // Check if the variable actually exists (and isn't just a potential
        // variable).
        if (model) {
          vars.push(model);
        }
      }
    }
  }
  return vars;
};

/**
 * Returns all bound-variables referenced by this block.
 * @return {!Array.<!Blockly.BoundVariableAbstract>} List of variables.
 * @package
 */
Blockly.Block.prototype.getBoundVariables = function() {
  var vars = [];
  for (var i = 0, input; input = this.inputList[i]; i++) {
    for (var j = 0, field; field = input.fieldRow[j]; j++) {
      if (field.referencesVariables() == Blockly.FIELD_VARIABLE_BINDING) {
        var variable = field.getVariable();
        if (variable) {
          vars.push(variable);
        }
      }
    }
  }
  return vars;
};

/**
 * Notification that a variable is renaming but keeping the same ID.  If the
 * variable is in use on this block, rerender to show the new name.
 * @param {!Blockly.VariableModel} variable The variable being renamed.
 * @package
 */
Blockly.Block.prototype.updateVarName = function(variable) {
  for (var i = 0, input; input = this.inputList[i]; i++) {
    for (var j = 0, field; field = input.fieldRow[j]; j++) {
      if (field.referencesVariables() == Blockly.FIELD_VARIABLE_DEFAULT &&
          variable.getId() == field.getValue()) {
        field.setText(variable.name);
      }
    }
  }
};

/**
 * Notification that a variable is renaming.
 * If the ID matches one of this block's variables, rename it.
 * @param {string} oldId ID of variable to rename.
 * @param {string} newId ID of new variable.  May be the same as oldId, but with
 *     an updated name.
 */
Blockly.Block.prototype.renameVarById = function(oldId, newId) {
  for (var i = 0, input; input = this.inputList[i]; i++) {
    for (var j = 0, field; field = input.fieldRow[j]; j++) {
      if (field.referencesVariables() == Blockly.FIELD_VARIABLE_DEFAULT &&
          oldId == field.getValue()) {
        field.setValue(newId);
      }
    }
  }
};

/**
 * Returns the language-neutral value from the field of a block.
 * @param {string} name The name of the field.
 * @return {?string} Value from the field or null if field does not exist.
 */
Blockly.Block.prototype.getFieldValue = function(name) {
  var field = this.getField(name);
  if (field) {
    return field.getValue();
  }
  return null;
};

/**
 * Change the field value for a block (e.g. 'CHOOSE' or 'REMOVE').
 * @param {string} newValue Value to be the new field.
 * @param {string} name The name of the field.
 */
Blockly.Block.prototype.setFieldValue = function(newValue, name) {
  var field = this.getField(name);
  goog.asserts.assertObject(field, 'Field "%s" not found.', name);
  field.setValue(newValue);
};

/**
 * Set whether this block can chain onto the bottom of another block.
 * @param {boolean} newBoolean True if there can be a previous statement.
 * @param {(string|Array.<string>|null)=} opt_check Statement type or
 *     list of statement types.  Null/undefined if any type could be connected.
 */
Blockly.Block.prototype.setPreviousStatement = function(newBoolean, opt_check) {
  if (newBoolean) {
    if (opt_check === undefined) {
      opt_check = null;
    }
    if (!this.previousConnection) {
      goog.asserts.assert(!this.outputConnection,
          'Remove output connection prior to adding previous connection.');
      this.previousConnection =
          this.makeConnection_(Blockly.PREVIOUS_STATEMENT);
    }
    this.previousConnection.setCheck(opt_check);
  } else {
    if (this.previousConnection) {
      goog.asserts.assert(!this.previousConnection.isConnected(),
          'Must disconnect previous statement before removing connection.');
      this.previousConnection.dispose();
      this.previousConnection = null;
    }
  }
};

/**
 * Set whether another block can chain onto the bottom of this block.
 * @param {boolean} newBoolean True if there can be a next statement.
 * @param {(string|Array.<string>|null)=} opt_check Statement type or
 *     list of statement types.  Null/undefined if any type could be connected.
 */
Blockly.Block.prototype.setNextStatement = function(newBoolean, opt_check) {
  if (newBoolean) {
    if (opt_check === undefined) {
      opt_check = null;
    }
    if (!this.nextConnection) {
      this.nextConnection = this.makeConnection_(Blockly.NEXT_STATEMENT);
    }
    this.nextConnection.setCheck(opt_check);
  } else {
    if (this.nextConnection) {
      goog.asserts.assert(!this.nextConnection.isConnected(),
          'Must disconnect next statement before removing connection.');
      this.nextConnection.dispose();
      this.nextConnection = null;
    }
  }
};

/**
 * Set whether this block returns a value.
 * @param {boolean} newBoolean True if there is an output.
 * @param {(string|Array.<string>|null)=} opt_check Returned type or list
 *     of returned types.  Null or undefined if any type could be returned
 *     (e.g. variable get).
 */
Blockly.Block.prototype.setOutput = function(newBoolean, opt_check) {
  if (newBoolean) {
    if (opt_check === undefined) {
      opt_check = null;
    }
    if (!this.outputConnection) {
      goog.asserts.assert(!this.previousConnection,
          'Remove previous connection prior to adding output connection.');
      this.outputConnection = this.makeConnection_(Blockly.OUTPUT_VALUE);
    }
    this.outputConnection.setCheck(opt_check);
  } else {
    if (this.outputConnection) {
      goog.asserts.assert(!this.outputConnection.isConnected(),
          'Must disconnect output value before removing connection.');
      this.outputConnection.dispose();
      this.outputConnection = null;
    }
  }
};

/**
 * Store the given type expression in the output connection of this block.
 * @param {!Blockly.TypeExpr} typeExpr The type expression to be stored in the
 *     output connection of this block.
 * @param {boolean=} opt_overwrite If true, overwrite a type expression already
 *     present on the connection.
 */
Blockly.Block.prototype.setOutputTypeExpr = function(typeExpr, opt_overwrite) {
  goog.asserts.assert(this.workspace.options.typedVersion,
      'Allow to have types only in a workspace of typedBlockly version.');
  this.outputConnection.setTypeExpr(typeExpr, opt_overwrite);
}

/**
 * Replace each of this block's type expressions by the corresponding one of
 * another block. If both blocks have nested blocks, also replace their type
 * expressions on them.
 * @param {!Blockly.Block} oldBlock The block whose type expressions to replace
 *     that of this block. Newly created type expressions are stored to the
 *     oldBlock after the replacement.
 */
Blockly.Block.prototype.replaceTypeExprWith = function(oldBlock) {
  var pairsToUnify = [[this, oldBlock]];
  while (pairsToUnify.length) {
    var pair = pairsToUnify.pop();
    var thisBlock = pair[0];
    var oldBlock = pair[1];
    if (thisBlock.type !== oldBlock.type) {
      continue;
    }
    if (thisBlock.outputConnection) {
      thisBlock.outputConnection.replaceTypeExprWith(
          oldBlock.outputConnection);
    }
    for (var i = 0, input; input = thisBlock.inputList[i]; i++) {
      var oldInput = oldBlock.inputList[i];
      if (input.connection) {
        goog.asserts.assert(input.name === oldInput.name);
        input.connection.replaceTypeExprWith(oldInput.connection);
        var targetBlock = input.connection.targetBlock();
        var oldTargetBlock = oldInput.connection.targetBlock();
        if (targetBlock && oldTargetBlock) {
          pairsToUnify.push([targetBlock, oldTargetBlock]);
        }
      }
    }
  }
  // oldBlock now refers to newly created type expressions. Trigger a type
  // inference.
  oldBlock.updateTypeInference();
};

/**
 * Set whether value inputs are arranged horizontally or vertically.
 * @param {boolean} newBoolean True if inputs are horizontal.
 */
Blockly.Block.prototype.setInputsInline = function(newBoolean) {
  if (this.inputsInline != newBoolean) {
    Blockly.Events.fire(new Blockly.Events.BlockChange(
        this, 'inline', null, this.inputsInline, newBoolean));
    this.inputsInline = newBoolean;
  }
};

/**
 * Get whether value inputs are arranged horizontally or vertically.
 * @return {boolean} True if inputs are horizontal.
 */
Blockly.Block.prototype.getInputsInline = function() {
  if (this.inputsInline != undefined) {
    // Set explicitly.
    return this.inputsInline;
  }
  // Not defined explicitly.  Figure out what would look best.
  for (var i = 1; i < this.inputList.length; i++) {
    if (this.inputList[i - 1].type == Blockly.DUMMY_INPUT &&
        this.inputList[i].type == Blockly.DUMMY_INPUT) {
      // Two dummy inputs in a row.  Don't inline them.
      return false;
    }
  }
  for (var i = 1; i < this.inputList.length; i++) {
    if (this.inputList[i - 1].type == Blockly.INPUT_VALUE &&
        this.inputList[i].type == Blockly.DUMMY_INPUT) {
      // Dummy input after a value input.  Inline them.
      return true;
    }
  }
  return false;
};

/**
 * Set whether the block is disabled or not.
 * @param {boolean} disabled True if disabled.
 */
Blockly.Block.prototype.setDisabled = function(disabled) {
  if (this.disabled != disabled) {
    Blockly.Events.fire(new Blockly.Events.BlockChange(
        this, 'disabled', null, this.disabled, disabled));
    this.disabled = disabled;
  }
};

/**
 * Get whether the block is disabled or not due to parents.
 * The block's own disabled property is not considered.
 * @return {boolean} True if disabled.
 */
Blockly.Block.prototype.getInheritedDisabled = function() {
  var ancestor = this.getSurroundParent();
  while (ancestor) {
    if (ancestor.disabled) {
      return true;
    }
    ancestor = ancestor.getSurroundParent();
  }
  // Ran off the top.
  return false;
};

/**
 * Get whether the block is collapsed or not.
 * @return {boolean} True if collapsed.
 */
Blockly.Block.prototype.isCollapsed = function() {
  return this.collapsed_;
};

/**
 * Set whether the block is collapsed or not.
 * @param {boolean} collapsed True if collapsed.
 */
Blockly.Block.prototype.setCollapsed = function(collapsed) {
  if (this.collapsed_ != collapsed) {
    Blockly.Events.fire(new Blockly.Events.BlockChange(
        this, 'collapsed', null, this.collapsed_, collapsed));
    this.collapsed_ = collapsed;
  }
};

/**
 * Get whether the block is able to transfer workspace.
 * @return {boolean} True if transferable.
 */
Blockly.Block.prototype.isTransferable = function() {
  // All blocks in a workspace of typed version are transferable.
  return this.workspace.options.typedVersion || this.transferable_;
};

/**
 * Set whether the block is able to transfer workspace.
 * @param {boolean} transferable True if transferable.
 */
Blockly.Block.prototype.setTransferable = function(transferable) {
  this.transferable_ = transferable;
};

/**
 * Get whether the block is currently transferring its workspace.
 * @return {boolean} True if this block is in the process of transferring.
 */
Blockly.Block.prototype.isTransferring = function() {
  if (!Blockly.transferring) {
    return false;
  }
  if (Blockly.transferring.workspace != this.workspace) {
    var transBlock = Blockly.transferring;
    var mutatorWs = transBlock.mutator && transBlock.mutator.getWorkspace();
    return !!mutatorWs &&
        Blockly.WorkspaceTree.isDescendant(this.workspace, mutatorWs);
  }

  var block = this;
  while (block) {
    if (Blockly.transferring == block) {
      return true;
    }
    block = block.getParent();
  }
  return false;
};

/**
 * Create a human-readable text representation of this block and any children.
 * @param {number=} opt_maxLength Truncate the string to this length.
 * @param {string=} opt_emptyToken The placeholder string used to denote an
 *     empty field. If not specified, '?' is used.
 * @return {string} Text of block.
 */
Blockly.Block.prototype.toString = function(opt_maxLength, opt_emptyToken) {
  var text = [];
  var emptyFieldPlaceholder = opt_emptyToken || '?';
  if (this.collapsed_) {
    text.push(this.getInput('_TEMP_COLLAPSED_INPUT').fieldRow[0].text_);
  } else {
    for (var i = 0, input; input = this.inputList[i]; i++) {
      for (var j = 0, field; field = input.fieldRow[j]; j++) {
        if (field instanceof Blockly.FieldDropdown && !field.getValue()) {
          text.push(emptyFieldPlaceholder);
        } else {
          text.push(field.getText());
        }
      }
      if (input.connection) {
        var child = input.connection.targetBlock();
        if (child) {
          text.push(child.toString(undefined, opt_emptyToken));
        } else {
          text.push(emptyFieldPlaceholder);
        }
      }
    }
  }
  text = goog.string.trim(text.join(' ')) || '???';
  if (opt_maxLength) {
    // TODO: Improve truncation so that text from this block is given priority.
    // E.g. "1+2+3+4+5+6+7+8+9=0" should be "...6+7+8+9=0", not "1+2+3+4+5...".
    // E.g. "1+2+3+4+5=6+7+8+9+0" should be "...4+5=6+7...".
    text = goog.string.truncate(text, opt_maxLength);
  }
  return text;
};

/**
 * Shortcut for appending a value input row.
 * @param {string} name Language-neutral identifier which may used to find this
 *     input again.  Should be unique to this block.
 * @return {!Blockly.Input} The input object created.
 */
Blockly.Block.prototype.appendValueInput = function(name) {
  return this.appendInput_(Blockly.INPUT_VALUE, name);
};

/**
 * Shortcut for appending a statement input row.
 * @param {string} name Language-neutral identifier which may used to find this
 *     input again.  Should be unique to this block.
 * @return {!Blockly.Input} The input object created.
 */
Blockly.Block.prototype.appendStatementInput = function(name) {
  return this.appendInput_(Blockly.NEXT_STATEMENT, name);
};

/**
 * Shortcut for appending a dummy input row.
 * @param {string=} opt_name Language-neutral identifier which may used to find
 *     this input again.  Should be unique to this block.
 * @return {!Blockly.Input} The input object created.
 */
Blockly.Block.prototype.appendDummyInput = function(opt_name) {
  return this.appendInput_(Blockly.DUMMY_INPUT, opt_name || '');
};

/**
 * Initialize this block using a cross-platform, internationalization-friendly
 * JSON description.
 * @param {!Object} json Structured data describing the block.
 */
Blockly.Block.prototype.jsonInit = function(json) {
  var warningPrefix = json['type'] ? 'Block "' + json['type'] + '": ' : '';

  // Validate inputs.
  goog.asserts.assert(
      json['output'] == undefined || json['previousStatement'] == undefined,
      warningPrefix + 'Must not have both an output and a previousStatement.');

  // Set basic properties of block.
  this.jsonInitColour_(json, warningPrefix);

  // Interpolate the message blocks.
  var i = 0;
  while (json['message' + i] !== undefined) {
    this.interpolate_(json['message' + i], json['args' + i] || [],
        json['lastDummyAlign' + i]);
    i++;
  }

  if (json['inputsInline'] !== undefined) {
    this.setInputsInline(json['inputsInline']);
  }
  // Set output and previous/next connections.
  if (json['output'] !== undefined) {
    this.setOutput(true, json['output']);
  }
  if (json['previousStatement'] !== undefined) {
    this.setPreviousStatement(true, json['previousStatement']);
  }
  if (json['nextStatement'] !== undefined) {
    this.setNextStatement(true, json['nextStatement']);
  }
  if (json['tooltip'] !== undefined) {
    var rawValue = json['tooltip'];
    var localizedText = Blockly.utils.replaceMessageReferences(rawValue);
    this.setTooltip(localizedText);
  }
  if (json['enableContextMenu'] !== undefined) {
    var rawValue = json['enableContextMenu'];
    this.contextMenu = !!rawValue;
  }
  if (json['helpUrl'] !== undefined) {
    var rawValue = json['helpUrl'];
    var localizedValue = Blockly.utils.replaceMessageReferences(rawValue);
    this.setHelpUrl(localizedValue);
  }
  if (goog.isString(json['extensions'])) {
    console.warn(
        warningPrefix + 'JSON attribute \'extensions\' should be an array of' +
        ' strings. Found raw string in JSON for \'' + json['type'] +
        '\' block.');
    json['extensions'] = [json['extensions']];  // Correct and continue.
  }

  // Add the mutator to the block
  if (json['mutator'] !== undefined) {
    Blockly.Extensions.apply(json['mutator'], this, true);
  }

  if (Array.isArray(json['extensions'])) {
    var extensionNames = json['extensions'];
    for (var j = 0; j < extensionNames.length; ++j) {
      var extensionName = extensionNames[j];
      Blockly.Extensions.apply(extensionName, this, false);
    }
  }
};

/**
 * Initialize the colour of this block from the JSON description.
 * @param {!Object} json Structured data describing the block.
 * @param {string} warningPrefix Warning prefix string identifying block.
 * @private
 */
Blockly.Block.prototype.jsonInitColour_ = function(json, warningPrefix) {
  if ('colour' in json) {
    if (json['colour'] === undefined) {
      console.warn(warningPrefix + 'Undefined color value.');
    } else {
      var rawValue = json['colour'];
      try {
        this.setColour(rawValue);
      } catch (colorError) {
        console.warn(warningPrefix + 'Illegal color value: ', rawValue);
      }
    }
  }
};

/**
 * Add key/values from mixinObj to this block object. By default, this method
 * will check that the keys in mixinObj will not overwrite existing values in
 * the block, including prototype values. This provides some insurance against
 * mixin / extension incompatibilities with future block features. This check
 * can be disabled by passing true as the second argument.
 * @param {!Object} mixinObj The key/values pairs to add to this block object.
 * @param {boolean=} opt_disableCheck Option flag to disable overwrite checks.
 */
Blockly.Block.prototype.mixin = function(mixinObj, opt_disableCheck) {
  if (goog.isDef(opt_disableCheck) && !goog.isBoolean(opt_disableCheck)) {
    throw new Error("opt_disableCheck must be a boolean if provided");
  }
  if (!opt_disableCheck) {
    var overwrites = [];
    for (var key in mixinObj) {
      if (this[key] !== undefined) {
        overwrites.push(key);
      }
    }
    if (overwrites.length) {
      throw new Error('Mixin will overwrite block members: ' +
        JSON.stringify(overwrites));
    }
  }
  goog.mixin(this, mixinObj);
};

/**
 * Interpolate a message description onto the block.
 * @param {string} message Text contains interpolation tokens (%1, %2, ...)
 *     that match with fields or inputs defined in the args array.
 * @param {!Array} args Array of arguments to be interpolated.
 * @param {string=} lastDummyAlign If a dummy input is added at the end,
 *     how should it be aligned?
 * @private
 */
Blockly.Block.prototype.interpolate_ = function(message, args, lastDummyAlign) {
  var tokens = Blockly.utils.tokenizeInterpolation(message);
  // Interpolate the arguments.  Build a list of elements.
  var indexDup = [];
  var indexCount = 0;
  var elements = [];
  for (var i = 0; i < tokens.length; i++) {
    var token = tokens[i];
    if (typeof token == 'number') {
      if (token <= 0 || token > args.length) {
        throw new Error('Block "' + this.type + '": ' +
            'Message index %' + token + ' out of range.');
      }
      if (indexDup[token]) {
        throw new Error('Block "' + this.type + '": ' +
            'Message index %' + token + ' duplicated.');
      }
      indexDup[token] = true;
      indexCount++;
      elements.push(args[token - 1]);
    } else {
      token = token.trim();
      if (token) {
        elements.push(token);
      }
    }
  }
  if (indexCount != args.length) {
    throw new Error('Block "' + this.type + '": ' +
        'Message does not reference all ' + args.length + ' arg(s).');
  }
  // Add last dummy input if needed.
  if (elements.length && (typeof elements[elements.length - 1] == 'string' ||
      goog.string.startsWith(
          elements[elements.length - 1]['type'], 'field_'))) {
    var dummyInput = {type: 'input_dummy'};
    if (lastDummyAlign) {
      dummyInput['align'] = lastDummyAlign;
    }
    elements.push(dummyInput);
  }
  // Lookup of alignment constants.
  var alignmentLookup = {
    'LEFT': Blockly.ALIGN_LEFT,
    'RIGHT': Blockly.ALIGN_RIGHT,
    'CENTRE': Blockly.ALIGN_CENTRE
  };
  // Populate block with inputs and fields.
  var fieldStack = [];
  for (var i = 0; i < elements.length; i++) {
    var element = elements[i];
    if (typeof element == 'string') {
      fieldStack.push([element, undefined]);
    } else {
      var field = null;
      var input = null;
      do {
        var altRepeat = false;
        if (typeof element == 'string') {
          field = new Blockly.FieldLabel(element);
        } else {
          switch (element['type']) {
            case 'input_value':
              input = this.appendValueInput(element['name']);
              break;
            case 'input_statement':
              input = this.appendStatementInput(element['name']);
              break;
            case 'input_dummy':
              input = this.appendDummyInput(element['name']);
              break;
            default:
              field = Blockly.Field.fromJson(element);

              // Unknown field.
              if (!field) {
                if (element['alt']) {
                  element = element['alt'];
                  altRepeat = true;
                } else {
                  console.warn('Blockly could not create a field of type ' +
                      element['type'] +
                      '. You may need to register your custom field.  See ' +
                      'github.com/google/blockly/issues/1584');
                }
              }
          }
        }
      } while (altRepeat);
      if (field) {
        fieldStack.push([field, element['name']]);
      } else if (input) {
        if (element['check']) {
          input.setCheck(element['check']);
        }
        if (element['align']) {
          input.setAlign(alignmentLookup[element['align']]);
        }
        for (var j = 0; j < fieldStack.length; j++) {
          input.appendField(fieldStack[j][0], fieldStack[j][1]);
        }
        fieldStack.length = 0;
      }
    }
  }
};

/**
 * Add a value input, statement input or local variable to this block.
 * @param {number} type Either Blockly.INPUT_VALUE or Blockly.NEXT_STATEMENT or
 *     Blockly.DUMMY_INPUT.
 * @param {string} name Language-neutral identifier which may used to find this
 *     input again.  Should be unique to this block.
 * @return {!Blockly.Input} The input object created.
 * @protected
 */
Blockly.Block.prototype.appendInput_ = function(type, name) {
  var connection = null;
  if (type == Blockly.INPUT_VALUE || type == Blockly.NEXT_STATEMENT) {
    connection = this.makeConnection_(type);
  }
  var input = new Blockly.Input(type, name, this, connection);
  // Append input to list.
  this.inputList.push(input);
  return input;
};

/**
 * Move a named input to a different location on this block.
 * @param {string} name The name of the input to move.
 * @param {?string} refName Name of input that should be after the moved input,
 *   or null to be the input at the end.
 */
Blockly.Block.prototype.moveInputBefore = function(name, refName) {
  if (name == refName) {
    return;
  }
  // Find both inputs.
  var inputIndex = -1;
  var refIndex = refName ? -1 : this.inputList.length;
  for (var i = 0, input; input = this.inputList[i]; i++) {
    if (input.name == name) {
      inputIndex = i;
      if (refIndex != -1) {
        break;
      }
    } else if (refName && input.name == refName) {
      refIndex = i;
      if (inputIndex != -1) {
        break;
      }
    }
  }
  goog.asserts.assert(inputIndex != -1, 'Named input "%s" not found.', name);
  goog.asserts.assert(
      refIndex != -1, 'Reference input "%s" not found.', refName);
  this.moveNumberedInputBefore(inputIndex, refIndex);
};

/**
 * Move a numbered input to a different location on this block.
 * @param {number} inputIndex Index of the input to move.
 * @param {number} refIndex Index of input that should be after the moved input.
 */
Blockly.Block.prototype.moveNumberedInputBefore = function(
    inputIndex, refIndex) {
  // Validate arguments.
  goog.asserts.assert(inputIndex != refIndex, 'Can\'t move input to itself.');
  goog.asserts.assert(inputIndex < this.inputList.length,
      'Input index ' + inputIndex + ' out of bounds.');
  goog.asserts.assert(refIndex <= this.inputList.length,
      'Reference input ' + refIndex + ' out of bounds.');
  // Remove input.
  var input = this.inputList[inputIndex];
  this.inputList.splice(inputIndex, 1);
  if (inputIndex < refIndex) {
    refIndex--;
  }
  // Reinsert input.
  this.inputList.splice(refIndex, 0, input);
};

/**
 * Remove an input from this block.
 * @param {string} name The name of the input.
 * @param {boolean=} opt_quiet True to prevent error if input is not present.
 * @throws {goog.asserts.AssertionError} if the input is not present and
 *     opt_quiet is not true.
 */
Blockly.Block.prototype.removeInput = function(name, opt_quiet) {
  for (var i = 0, input; input = this.inputList[i]; i++) {
    if (input.name == name) {
      if (input.connection && input.connection.isConnected()) {
        input.connection.setShadowDom(null);
        var block = input.connection.targetBlock();
        if (block.isShadow()) {
          // Destroy any attached shadow block.
          block.dispose();
        } else {
          // Disconnect any attached normal block.
          block.unplug();
        }
      }
      input.dispose();
      this.inputList.splice(i, 1);
      return;
    }
  }
  if (!opt_quiet) {
    goog.asserts.fail('Input "%s" not found.', name);
  }
};

/**
 * Fetches the named input object.
 * @param {string} name The name of the input.
 * @return {Blockly.Input} The input object, or null if input does not exist.
 */
Blockly.Block.prototype.getInput = function(name) {
  for (var i = 0, input; input = this.inputList[i]; i++) {
    if (input.name == name) {
      return input;
    }
  }
  // This input does not exist.
  return null;
};

/**
 * Fetches the block attached to the named input.
 * @param {string} name The name of the input.
 * @return {Blockly.Block} The attached value block, or null if the input is
 *     either disconnected or if the input does not exist.
 */
Blockly.Block.prototype.getInputTargetBlock = function(name) {
  var input = this.getInput(name);
  return input && input.connection && input.connection.targetBlock();
};

/**
 * Returns the comment on this block (or '' if none).
 * @return {string} Block's comment.
 */
Blockly.Block.prototype.getCommentText = function() {
  return this.comment || '';
};

/**
 * Set this block's comment text.
 * @param {?string} text The text, or null to delete.
 */
Blockly.Block.prototype.setCommentText = function(text) {
  if (this.comment != text) {
    Blockly.Events.fire(new Blockly.Events.BlockChange(
        this, 'comment', null, this.comment, text || ''));
    this.comment = text;
  }
};

/**
 * Set this block's warning text.
 * @param {?string} _text The text, or null to delete.
 * @param {string=} _opt_id An optional ID for the warning text to be able to
 *     maintain multiple warnings.
 */
Blockly.Block.prototype.setWarningText = function(_text, _opt_id) {
  // NOP.
};

/**
 * Give this block a mutator dialog.
 * @param {Blockly.Mutator} _mutator A mutator dialog instance or null to
 *     remove.
 */
Blockly.Block.prototype.setMutator = function(_mutator) {
  // NOP.
};

/**
 * Return the coordinates of the top-left corner of this block relative to the
 * drawing surface's origin (0,0), in workspace units.
 * @return {!goog.math.Coordinate} Object with .x and .y properties.
 */
Blockly.Block.prototype.getRelativeToSurfaceXY = function() {
  return this.xy_;
};

/**
 * Move a block by a relative offset.
 * @param {number} dx Horizontal offset, in workspace units.
 * @param {number} dy Vertical offset, in workspace units.
 */
Blockly.Block.prototype.moveBy = function(dx, dy) {
  goog.asserts.assert(!this.parentBlock_, 'Block has parent.');
  var event = new Blockly.Events.BlockMove(this);
  this.xy_.translate(dx, dy);
  event.recordNew();
  Blockly.Events.fire(event);
};

/**
 * Update type inference for this block.
 * @param {boolean=} opt_reset True if types should be reset first.
 */
Blockly.Block.prototype.updateTypeInference = function(opt_reset) {
  if (opt_reset)
    this.clearTypes && this.clearTypes();
  this.infer && this.infer({});
};

/**
 * Whether there would be no getter block which refers to a non-existing
 * variable. Check not only this block but also all the blocks nested inside
 * it.
 * @param {Blockly.Connection} parentConnection Connection this block is trying
 *     to connect to, which means that this block would share a variable context
 *     with the parent. If null, the block is not connected to any block.
 * @param {boolean=} opt_bind Bind the getter with the proper variable if
 *     true.
 * @return {boolean} True if all of getter blocks inside this block  can refer
 *     to a existing variable.
 */
Blockly.Block.prototype.resolveReference = function(parentConnection,
      opt_bind) {
  if (parentConnection) {
    var parentBlock = parentConnection.getSourceBlock();
    var env = parentBlock.allVisibleVariables(parentConnection);
  } else {
    var env = {};
  }

  var bfsStack = [[this, env]];
  var allSuccess = true;
  while (bfsStack.length) {
    var pair = bfsStack.shift();
    var block = pair[0];
    var envOfParent = pair[1];

    var success = block.resolveReferenceWithEnv_(envOfParent, opt_bind);
    allSuccess = allSuccess && success;
    if (!success && !opt_bind) {
      // Some of references can not be resolved. If no need to bind other
      // references, just quit.
      return false;
    }

    for (var i = 0, child; child = block.childBlocks_[i]; i++) {
      var outputConn = child.outputConnection;
      var targetConn = outputConn && outputConn.targetConnection;
      var additionalEnv = block.allVisibleVariables(targetConn, false);
      var envOfChild = Object.assign({}, envOfParent);
      Object.assign(envOfChild, additionalEnv);
      bfsStack.push([child, envOfChild]);
    }
  }
  return allSuccess;
};

/**
 * Returns if all of references this block contains can be resolved with the
 * given variable environment.
 * @param {!Object} env The Object mapping variable name to a variable which
 *     can be referred to by reference in this block keyed by variable's name.
 * @param {boolean=} opt_bind Bind the getter with the proper variable if
 *     true.
 * @return {boolean} True if all of references this block contains are
 *     resolved. Otherwise false.
 */
Blockly.Block.prototype.resolveReferenceWithEnv_ = function(env, opt_bind) {
  var variableList = this.getBoundVariables();
  var allBound = true;
  for (var i = 0, variable; variable = variableList[i]; i++) {
    var name = variable.getVariableName();
    var value = env[name];
    if (variable.isReference()) {
      if (opt_bind) {
        // Initialize the current bound value.
        variable.removeBoundValue();
        if (value) {
          variable.setBoundValue(value);
        } else {
          // This reference could not be resolved. Return false later.
          allBound = false;
        }
      } else if (!value) {
        return false;
      }
    }
  }
  return opt_bind ? allBound : true;
};

/**
 * Return all variables which is declared in blocks, and can be used later in
 * the given connection's input.
 * @param {!Blockly.Connection} connection Connection to specify a scope.
 * @param {boolean=} opt_bubble If false, just get variables in this block.
 *   If true, also get variables its ancestor blocks. Defaults to true.
 * @return {Object} Object mapping variable name to its variable representation.
 */
Blockly.Block.prototype.allVisibleVariables = function(conn, opt_bubble) {
  var env = {};
  // TODO(harukam): Use ordered dictionary to keep the order of variable
  // declaration.
  if (conn.getSourceBlock() == this) {
    if (opt_bubble !== false && this.parentBlock_) {
      var targetConnection = this.outputConnection.targetConnection;
      env = this.parentBlock_.allVisibleVariables(targetConnection, true);
    }
    if (goog.isFunction(this.getVisibleVariables)) {
      var scopeVariables = this.getVisibleVariables(conn);
      env = Object.assign(env, scopeVariables);
    }
  }
  return env;
};

/**
 * Create a connection of the specified type.
 * @param {number} type The type of the connection to create.
 * @return {!Blockly.Connection} A new connection of the specified type.
 * @private
 */
Blockly.Block.prototype.makeConnection_ = function(type) {
  return new Blockly.Connection(this, type);
};

/**
 * Call the Infer function indirectly if it exists.
 * @param {string} name The name of the input
 * @param {Object<string, Blockly.RenderedTypeExpr>} env
 * @return {Blockly.RenderedTypeExpr} type expression of the input
 */
Blockly.Block.prototype.callInfer_ = function(name, env) {
  var input = this.getInput(name);
  goog.asserts.assert(!!input, 'Invalid input name');
  var childBlock = input.connection.targetBlock();
  if (!childBlock)
    return null;
  else if (childBlock.infer)
    return childBlock.infer(env);
  else
    return childBlock.outputConnection.typeExpr;
};

/**
 * Call the clearTypes function indirectly if it exists.
 * @param {string} name The name of the input
 */
Blockly.Block.prototype.callClearTypes_ = function(name) {
  var input = this.getInput(name);
  goog.asserts.assert(!!input, 'Invalid input name');
  var childBlock = input.connection.targetBlock();
  if (childBlock && childBlock.clearTypes)
    childBlock.clearTypes();
};

/**
 * Recursively checks whether all statement and value inputs are filled with
 * blocks. Also checks all following statement blocks in this stack.
 * @param {boolean=} opt_shadowBlocksAreFilled An optional argument controlling
 *     whether shadow blocks are counted as filled. Defaults to true.
 * @return {boolean} True if all inputs are filled, false otherwise.
 */
Blockly.Block.prototype.allInputsFilled = function(opt_shadowBlocksAreFilled) {
  // Account for the shadow block filledness toggle.
  if (opt_shadowBlocksAreFilled === undefined) {
    opt_shadowBlocksAreFilled = true;
  }
  if (!opt_shadowBlocksAreFilled && this.isShadow()) {
    return false;
  }

  // Recursively check each input block of the current block.
  for (var i = 0, input; input = this.inputList[i]; i++) {
    if (!input.connection) {
      continue;
    }
    var target = input.connection.targetBlock();
    if (!target || !target.allInputsFilled(opt_shadowBlocksAreFilled)) {
      return false;
    }
  }

  // Recursively check the next block after the current block.
  var next = this.getNextBlock();
  if (next) {
    return next.allInputsFilled(opt_shadowBlocksAreFilled);
  }

  return true;
};

/**
 * This method returns a string describing this Block in developer terms (type
 * name and ID; English only).
 *
 * Intended to on be used in console logs and errors. If you need a string that
 * uses the user's native language (including block text, field values, and
 * child blocks), use [toString()]{@link Blockly.Block#toString}.
 * @return {string} The description.
 */
Blockly.Block.prototype.toDevString = function() {
  var msg = this.type ? '"' + this.type + '" block' : 'Block';
  if (this.id) {
    msg += ' (id="' + this.id + '")';
  }
  return msg;
};

// TODO(harukam): Define a class representing blocks with type expressions as
// a subclass of Blockly.Block, and move functions related to typing in this
// file to that class.

/* should go in blocks/logic.js */

Blockly.Blocks['logic_boolean_typed'] = {
  /**
   * Block for boolean data type: true and false.
   * @this Blockly.Block
   */
  init: function() {
    var BOOLEANS =
        [[Blockly.Msg.LOGIC_BOOLEAN_TRUE, 'TRUE'],
         [Blockly.Msg.LOGIC_BOOLEAN_FALSE, 'FALSE']];
    this.setHelpUrl(Blockly.Msg.LOGIC_BOOLEAN_HELPURL);
    this.setColour(210);
    this.setOutput(true, 'Boolean');
    // TODO: Define a function to create a type expression in the same way as
    // makeConnection_ in block.js and block_svg.js.
    this.setOutputTypeExpr(new Blockly.RenderedTypeExpr.BOOL());
    this.appendDummyInput()
        .appendField(new Blockly.FieldDropdown(BOOLEANS), 'BOOL');
    this.setTooltip(Blockly.Msg.LOGIC_BOOLEAN_TOOLTIP);
  }
};

Blockly.Blocks['logic_compare_typed'] = {
  /**
   * Block for comparison operator.
   * @this Blockly.Block
   */
  init: function() {
    var OPERATORS = Blockly.RTL ? [
          ['=', 'EQ'],
          ['\u2260', 'NEQ'],
          ['>', 'LT'],
          ['\u2265', 'LTE'],
          ['<', 'GT'],
          ['\u2264', 'GTE']
        ] : [
          ['=', 'EQ'],
          ['\u2260', 'NEQ'],
          ['<', 'LT'],
          ['\u2264', 'LTE'],
          ['>', 'GT'],
          ['\u2265', 'GTE']
        ];
    this.setHelpUrl(Blockly.Msg.LOGIC_COMPARE_HELPURL);
    this.setColour(210);
    this.setOutput(true, 'Boolean');
    // Sorin
    this.setOutputTypeExpr(new Blockly.RenderedTypeExpr.BOOL());
    var A = Blockly.RenderedTypeExpr.generateTypeVar();
    this.appendValueInput('A')
        .setTypeExpr(A);
    this.appendValueInput('B')
        .setTypeExpr(A)
        .appendField(new Blockly.FieldDropdown(OPERATORS), 'OP');
    this.setInputsInline(true);
    // Assign 'this' to a variable for use in the tooltip closure below.
    var thisBlock = this;
    this.setTooltip(function() {
      var op = thisBlock.getFieldValue('OP');
      var TOOLTIPS = {
        'EQ': Blockly.Msg.LOGIC_COMPARE_TOOLTIP_EQ,
        'NEQ': Blockly.Msg.LOGIC_COMPARE_TOOLTIP_NEQ,
        'LT': Blockly.Msg.LOGIC_COMPARE_TOOLTIP_LT,
        'LTE': Blockly.Msg.LOGIC_COMPARE_TOOLTIP_LTE,
        'GT': Blockly.Msg.LOGIC_COMPARE_TOOLTIP_GT,
        'GTE': Blockly.Msg.LOGIC_COMPARE_TOOLTIP_GTE
      };
      return TOOLTIPS[op];
    });
  },

  clearTypes: function() {
    this.getInput('A').connection.typeExpr.clear();
    this.callClearTypes_('A');
    this.callClearTypes_('B');
  },

  infer: function(env) {
    var expected_left = this.getInput('A').connection.typeExpr;
    var left = this.callInfer_('A', env);
    var right = this.callInfer_('B', env);
    if (left)
      left.unify(expected_left);
    if (right)
      right.unify(expected_left);
    return new Blockly.RenderedTypeExpr.BOOL();
  }
};

Blockly.Blocks['logic_ternary_typed'] = {
  /**
   * Block for ternary operator.
   * @this Blockly.Block
   */
  init: function() {
    this.setHelpUrl(Blockly.Msg.LOGIC_TERNARY_HELPURL);
    this.setColour(210);
    var A = Blockly.RenderedTypeExpr.generateTypeVar();
    this.appendValueInput('IF')
        .setCheck('Boolean')
        .setTypeExpr(new Blockly.RenderedTypeExpr.BOOL())
        .appendField('if')
    this.appendValueInput('THEN')
        .setTypeExpr(A)
        .appendField('then')
    this.appendValueInput('ELSE')
        .setTypeExpr(A)
        .appendField('else');
    this.setInputsInline(true);
    this.setOutput(true);
    this.setOutputTypeExpr(A);
    this.setTooltip(Blockly.Msg.LOGIC_TERNARY_TOOLTIP);
  },

  clearTypes: function() {
    this.outputConnection.typeExpr.clear();
    this.callClearTypes_('IF');
    this.callClearTypes_('THEN');
    this.callClearTypes_('ELSE');
  },

  infer: function(env) {
    var cond_expected = new Blockly.RenderedTypeExpr.BOOL();
    var cond_type = this.callInfer_('IF', env);
    if (cond_type)
      cond_type.unify(cond_expected);
    var expected = this.outputConnection.typeExpr;
    var then_type = this.callInfer_('THEN', env);
    var else_type = this.callInfer_('ELSE', env);
    if (then_type)
      then_type.unify(expected);
    if (else_type)
      else_type.unify(expected);
    return expected;
  }
};

/* should go in blocks/math.js */ 
Blockly.Blocks['int_typed'] = {
  /**
   * Block for numeric value.
   * @this Blockly.Block
   */
  init: function() {
    this.setHelpUrl(Blockly.Msg.MATH_NUMBER_HELPURL);
    this.setColour(230);
    this.appendDummyInput()
        .appendField(new Blockly.FieldTextInput('0',
        Blockly.FieldTextInput.intValidator), 'INT');
    this.setOutput(true, 'Int');
    // Sorin
    this.setOutputTypeExpr(new Blockly.RenderedTypeExpr.INT());
    this.setTooltip(Blockly.Msg.MATH_NUMBER_TOOLTIP);
  }
};

/* should go in blocks/math.js */ 
Blockly.Blocks['int_arithmetic_typed'] = {
  /**
   * Block for basic arithmetic operator.
   * @this Blockly.Block
   */
  init: function() {
    var OPERATORS =
        [[Blockly.Msg.MATH_ADDITION_SYMBOL, 'ADD_INT'],
         [Blockly.Msg.MATH_SUBTRACTION_SYMBOL, 'MINUS_INT'],
         [Blockly.Msg.MATH_MULTIPLICATION_SYMBOL, 'MULTIPLY_INT'],
         [Blockly.Msg.MATH_DIVISION_SYMBOL, 'DIVIDE_INT']];
    this.setHelpUrl(Blockly.Msg.MATH_ARITHMETIC_HELPURL);
    this.setColour(230);
    this.setOutput(true, 'Int');
    // Sorin
    this.setOutputTypeExpr(new Blockly.RenderedTypeExpr.INT());
    this.appendValueInput('A')
        .setTypeExpr(new Blockly.RenderedTypeExpr.INT())
        .setCheck('Int');
    this.appendValueInput('B')
        .setTypeExpr(new Blockly.RenderedTypeExpr.INT())
        .setCheck('Int')
        .appendField(new Blockly.FieldDropdown(OPERATORS), 'OP_INT');
    this.setInputsInline(true);
    // Assign 'this' to a variable for use in the tooltip closure below.
    var thisBlock = this;
    this.setTooltip(function() {
      var mode = thisBlock.getFieldValue('OP_INT');
      var TOOLTIPS = {
        'ADD_INT': Blockly.Msg.MATH_ARITHMETIC_TOOLTIP_ADD,
        'MINUS_INT': Blockly.Msg.MATH_ARITHMETIC_TOOLTIP_MINUS,
        'MULTIPLY_INT': Blockly.Msg.MATH_ARITHMETIC_TOOLTIP_MULTIPLY,
        'DIVIDE_INT': Blockly.Msg.MATH_ARITHMETIC_TOOLTIP_DIVIDE
      };
      return TOOLTIPS[mode];
    });
  },

  clearTypes: function() {
    this.callClearTypes_('A');
    this.callClearTypes_('B');
  },

  infer: function(env) {
    var expected_left = new Blockly.RenderedTypeExpr.INT();
    var left = this.callInfer_('A', env);
    var right = this.callInfer_('B', env);
    if (left)
      left.unify(expected_left);
    if (right)
      right.unify(expected_left);
    return expected_left;
  }
};

/* should go in blocks/math.js */ 
Blockly.Blocks['float_typed'] = {
  /**
   * Block for numeric value.
   * @this Blockly.Block
   */
  init: function() {
    this.setHelpUrl(Blockly.Msg.MATH_NUMBER_HELPURL);
    this.setColour(100);
    this.appendDummyInput()
        .appendField(new Blockly.FieldTextInput('0.',
        Blockly.FieldTextInput.floatValidator), 'Float');
    this.setOutput(true, 'Float');
    // Sorin
    this.setOutputTypeExpr(new Blockly.RenderedTypeExpr.FLOAT());
    this.setTooltip(Blockly.Msg.MATH_NUMBER_TOOLTIP);
  }
};

/* should go in blocks/math.js */ 
Blockly.Blocks['float_arithmetic_typed'] = {
  /**
   * Block for basic arithmetic operator.
   * @this Blockly.Block
   */
  init: function() {
    var OPERATORS =
        [['+.', 'ADD_FLOAT'],
         ['-.', 'MINUS_FLOAT'],
         ['*.', 'MULTIPLY_FLOAT'],
         ['/.', 'DIVIDE_FLOAT']];
    this.setHelpUrl(Blockly.Msg.MATH_ARITHMETIC_HELPURL);
    this.setColour(100);
    this.setOutput(true, 'Float');
    // Sorin
    this.setOutputTypeExpr(new Blockly.RenderedTypeExpr.FLOAT());
    this.appendValueInput('A')
        .setTypeExpr(new Blockly.RenderedTypeExpr.FLOAT())
        .setCheck('Float');
    this.appendValueInput('B')
        .setTypeExpr(new Blockly.RenderedTypeExpr.FLOAT())
        .setCheck('Float')
        .appendField(new Blockly.FieldDropdown(OPERATORS), 'OP_FLOAT');
    this.setInputsInline(true);
    // Assign 'this' to a variable for use in the tooltip closure below.
    var thisBlock = this;
    this.setTooltip(function() {
      var mode = thisBlock.getFieldValue('OP_FLOAT');
      var TOOLTIPS = {
        'ADD_FLOAT': Blockly.Msg.MATH_ARITHMETIC_TOOLTIP_ADD,
        'MINUS_FLOAT': Blockly.Msg.MATH_ARITHMETIC_TOOLTIP_MINUS,
        'MULTIPLY_FLOAT': Blockly.Msg.MATH_ARITHMETIC_TOOLTIP_MULTIPLY,
        'DIVIDE_FLOAT': Blockly.Msg.MATH_ARITHMETIC_TOOLTIP_DIVIDE,
      };
      return TOOLTIPS[mode];
    });
  },

  clearTypes: function() {
    this.callClearTypes_('A');
    this.callClearTypes_('B');
  },

  infer: function(env) {
    var expected_left = new Blockly.RenderedTypeExpr.FLOAT();
    var left = this.callInfer_('A', env);
    var right = this.callInfer_('B', env);
    if (left)
      left.unify(expected_left);
    if (right)
      right.unify(expected_left);
    return expected_left;
  }
};


/* should go in blocks/lists.js */ 
Blockly.Blocks['lists_create_with_typed'] = {
  /**
   * Block for creating a list with any number of elements of any type.
   * @this Blockly.Block
   */
  init: function() {
    this.setColour(260);
    var element_type = Blockly.RenderedTypeExpr.generateTypeVar();
    this.appendDummyInput('LPAREN')
        .appendField('[');
    this.appendValueInput('ADD0')
        .setTypeExpr(element_type);
    this.appendValueInput('ADD1')
        .setTypeExpr(element_type)
        .appendField(';');
    this.appendValueInput('ADD2')
        .setTypeExpr(element_type)
        .appendField(';');
    this.appendDummyInput('RPAREN')
        .appendField(']');
    this.setOutput(true, 'Array');
    this.setOutputTypeExpr(new Blockly.RenderedTypeExpr.LIST(element_type));
    this.setMutator(new Blockly.Mutator(['lists_create_with_item']));
    this.setTooltip(Blockly.Msg.LISTS_CREATE_WITH_TOOLTIP);
    this.itemCount_ = 3;
    // https://developers.google.com/blockly/guides/create-custom-blocks/define-blocks
    this.setInputsInline(true);
  },
  /**
   * Create XML to represent list inputs.
   * @return {Element} XML storage element.
   * @this Blockly.Block
   */
  mutationToDom: function() {
    var container = document.createElement('mutation');
    container.setAttribute('items', this.itemCount_);
    return container;
  },
  /**
   * Parse XML to restore the list inputs.
   * @param {!Element} xmlElement XML storage element.
   * @this Blockly.Block
   */
  domToMutation: function(xmlElement) {
    this.removeInput('LPAREN');
    for (var x = 0; x < this.itemCount_; x++) {
      this.removeInput('ADD' + x);
    }
    this.removeInput('RPAREN');
    this.itemCount_ = parseInt(xmlElement.getAttribute('items'), 10);
    this.appendDummyInput('LPAREN')
        .appendField('[');
    var element_type = this.outputConnection.typeExpr.element_type;
    for (var x = 0; x < this.itemCount_; x++) {
      var input = this.appendValueInput('ADD' + x)
                      .setTypeExpr(element_type);
      if (x != 0) {
        input.appendField(';');
      }
    }
    this.appendDummyInput('RPAREN')
        .appendField(']');
  },
  /**
   * Populate the mutator's dialog with this block's components.
   * @param {!Blockly.Workspace} workspace Mutator's workspace.
   * @return {!Blockly.Block} Root block in mutator.
   * @this Blockly.Block
   */
  decompose: function(workspace) {
    var containerBlock =
        workspace.newBlock('lists_create_with_container');
    containerBlock.initSvg();
    var connection = containerBlock.getInput('STACK').connection;
    for (var x = 0; x < this.itemCount_; x++) {
      var itemBlock = workspace.newBlock('lists_create_with_item');
      itemBlock.initSvg();
      connection.connect(itemBlock.previousConnection);
      connection = itemBlock.nextConnection;
    }
    return containerBlock;
  },
  /**
   * Reconfigure this block based on the mutator dialog's components.
   * @param {!Blockly.Block} containerBlock Root block in mutator.
   * @this Blockly.Block
   */
  compose: function(containerBlock) {
    // Disconnect all input blocks and remove all inputs.
    this.removeInput('RPAREN');
    for (; 0 < this.itemCount_; this.itemCount_--) {
      var index = this.itemCount_ - 1;
      this.removeInput('ADD' + index);
    }
    // Rebuild the block's inputs.
    var itemBlock = containerBlock.getInputTargetBlock('STACK');
    var element_type = this.outputConnection.typeExpr.element_type;
    while (itemBlock) {
      var input = this.appendValueInput('ADD' + this.itemCount_)
                      .setTypeExpr(element_type);
      if (this.itemCount_ != 0) {
        input.appendField(';');
      }
      // Reconnect any child blocks.
      this.itemCount_++;
      // The length of items should be updated in advance of connecting two
      // blocks. This is because type inference, which depends on the length
      // of items, occurs when connecting two blocks.
      if (itemBlock.valueConnection_) {
        input.connection.connect(itemBlock.valueConnection_);
      }
      itemBlock = itemBlock.nextConnection &&
          itemBlock.nextConnection.targetBlock();
    }
    this.appendDummyInput('RPAREN')
        .appendField(']');
  },
  /**
   * Store pointers to any connected child blocks.
   * @param {!Blockly.Block} containerBlock Root block in mutator.
   * @this Blockly.Block
   */
  saveConnections: function(containerBlock) {
    var itemBlock = containerBlock.getInputTargetBlock('STACK');
    var x = 0;
    while (itemBlock) {
      var input = this.getInput('ADD' + x);
      itemBlock.valueConnection_ = input && input.connection.targetConnection;
      x++;
      itemBlock = itemBlock.nextConnection &&
          itemBlock.nextConnection.targetBlock();
    }
  },

  clearTypes: function() {
    this.outputConnection.typeExpr.element_type.clear();
    for (var x = 0; x < this.itemCount_; x++)
      this.callClearTypes_('ADD' + x);
  },

  infer: function(env) {
    var expected = this.outputConnection.typeExpr;
    for (var x = 0; x < this.itemCount_; x++) {
      var type = this.callInfer_('ADD' + x, env);
      if (type)
        type.unify(expected.element_type);
    }
    return expected;
  }
};

/**
 * Pairs
 */
Blockly.Blocks['pair_create_typed'] = {
  /**
   */
  init: function() {
    this.setColour(210);
    var A = Blockly.RenderedTypeExpr.generateTypeVar();
    var B = Blockly.RenderedTypeExpr.generateTypeVar();
    this.appendValueInput('FIRST')
        .setTypeExpr(A)
        .appendField('(');
    this.appendValueInput('SECOND')
        .setTypeExpr(B)
        .appendField(',');
    this.appendDummyInput()
        .appendField(')');
    this.setOutput(true);
    this.setOutputTypeExpr(new Blockly.RenderedTypeExpr.PAIR(A, B));
    this.setInputsInline(true);
  },

  clearTypes: function() {
    this.outputConnection.typeExpr.first_type.clear();
    this.outputConnection.typeExpr.second_type.clear();
    this.callClearTypes_('FIRST');
    this.callClearTypes_('SECOND');
  },

  infer: function(env) {
    var expected = this.outputConnection.typeExpr;
    var first = this.callInfer_('FIRST', env);
    var second = this.callInfer_('SECOND', env);
    if (first)
      first.unify(expected.first_type);
    if (second)
      second.unify(expected.second_type);
    return expected;
  }
};

Blockly.Blocks['pair_first_typed'] = {
  /**
   */
  init: function() {
    this.setColour(210);
    var A = Blockly.RenderedTypeExpr.generateTypeVar();
    var B = Blockly.RenderedTypeExpr.generateTypeVar();
    var pair_t = new Blockly.RenderedTypeExpr.PAIR(A, B);
    this.appendValueInput('FIRST')
        .setTypeExpr(pair_t)
        .appendField('first (');
    this.appendDummyInput()
        .appendField(')');
    this.setOutput(true);
    this.setOutputTypeExpr(A);
    this.setInputsInline(true);
  },

  clearTypes: function() {
    this.outputConnection.typeExpr.clear();
    this.callClearTypes_('FIRST');
  },

  infer: function(env) {
    var expected = this.outputConnection.typeExpr;
    var expected_arg = this.getInput('FIRST').connection.typeExpr;
    var arg = this.callInfer_('FIRST', env);
    if (arg) {
      arg.first_type.unify(expected_arg.first_type);
      arg.second_type.unify(expected_arg.second_type);
    }
    return expected;
  }
};

Blockly.Blocks['pair_second_typed'] = {
  /**
   */
  init: function() {
    this.setColour(210);
    var A = Blockly.RenderedTypeExpr.generateTypeVar();
    var B = Blockly.RenderedTypeExpr.generateTypeVar();
    var pair_t = new Blockly.RenderedTypeExpr.PAIR(A, B);
    this.appendValueInput('SECOND')
        .setTypeExpr(pair_t)
        .appendField('second (');
    this.appendDummyInput()
        .appendField(')');
    this.setOutput(true);
    this.setOutputTypeExpr(B);
    this.setInputsInline(true);
  },

  clearTypes: function() {
    this.outputConnection.typeExpr.clear();
    this.callClearTypes_('SECOND');
  },

  infer: function(env) {
    var expected = this.outputConnection.typeExpr;
    var expected_arg = this.getInput('SECOND').connection.typeExpr;
    var arg = this.callInfer_('SECOND', env);
    if (arg) {
      arg.first_type.unify(expected_arg.first_type);
      arg.second_type.unify(expected_arg.second_type);
    }
    return expected;
  }
};

Blockly.Blocks['lambda_typed'] = {
  /**
   */
  init: function() {
    this.setColour(290);
    var A = Blockly.RenderedTypeExpr.generateTypeVar();
    var B = Blockly.RenderedTypeExpr.generateTypeVar();
    var variable_field = Blockly.FieldBoundVariable.newValue(A, 'RETURN');
    this.appendDummyInput()
        .appendField('λ')
        .appendField(variable_field, 'VAR');
    this.appendValueInput('RETURN')
        .setTypeExpr(B)
        .setAlign(Blockly.ALIGN_RIGHT)
        .appendField('->');
    this.setMutator(new Blockly.Workbench());
    this.setInputsInline(true);
    this.setOutput(true);
    this.setOutputTypeExpr(new Blockly.RenderedTypeExpr.FUN(A, B));
  },

  /**
   * Update the type expressions of bound-variable fields on this block.
   * Would be called if the block's type expressions are replaced with other
   * ones, and a type expression this field's variable refers to is no longer
   * up-to-date.
   */
  typeExprReplaced: function() {
    var A = this.outputConnection.typeExpr.arg_type;
    var field = this.getField('VAR');
    var variable = field.getVariable();
    variable.setTypeExpr(A);
  },

  /**
   * Return all variables of which is declared in this block, and can be used
   * later the given connection's input.
   * @param {!Blockly.Connection} connection Connection to specify a scope.
   * @return {Object} Object mapping variable name to its variable
   *     representations.
   */
  getVisibleVariables: function(conn) {
    var returnInput = this.getInput('RETURN');
    var map = {};
    if (returnInput.connection == conn) {
      var variable = this.typedValue['VAR'];
      var name = variable.getVariableName();
      map[name] = variable;
    }
    return map;
  },

  /**
   * Return a DOM tree of blocks to show in the workbench's flyout.
   * @return {Node} DOM tree of blocks.
   */
  getTreeInFlyout: function() {
    var xml = goog.dom.createDom('xml');
    var returnInput = this.getInput('RETURN');
    var env = this.allVisibleVariables(returnInput.connection);

    var names = Object.keys(env);
    for (var i = 0, name; name = names[i]; i++) {
      var variable = env[name];
      var getterBlock = this.workspace.newBlock('variables_get_typed');
      var field = getterBlock.getField('VAR');
      field.setVariableName(name);
      field.setBoundValue(variable);
      var dom = Blockly.Xml.blockToDom(getterBlock);
      getterBlock.dispose();
      xml.appendChild(dom);
    }
    return xml;
  },

  clearTypes: function() {
    this.outputConnection.typeExpr.arg_type.clear();
    this.outputConnection.typeExpr.return_type.clear();
    this.callClearTypes_('RETURN');
  },

  infer: function(env) {
    var var_name = this.getField('VAR').getText();
    var expected = this.outputConnection.typeExpr;
    var env2 = Object.assign({}, env);
    env2[var_name] = expected.arg_type;
    var return_type = this.callInfer_('RETURN', env2);
    if (return_type)
      return_type.unify(expected.return_type);
    return expected;
  }
}

Blockly.Blocks['lambda_app_typed'] = {
  /**
   */
  init: function() {
    this.setColour(290);
    var A = Blockly.RenderedTypeExpr.generateTypeVar();
    var B = Blockly.RenderedTypeExpr.generateTypeVar();
    this.appendValueInput('FUN')
        .setTypeExpr(new Blockly.RenderedTypeExpr.FUN(A, B))
    this.appendValueInput('ARG')
        .setTypeExpr(A)
        .setAlign(Blockly.ALIGN_RIGHT)
        .appendField(' ');
    this.setInputsInline(true);
    this.setOutput(true);
    this.setOutputTypeExpr(B);
    this.setInputsInline(true);
  },

  clearTypes: function() {
    this.getInput('FUN').connection.typeExpr.arg_type.clear();
    this.getInput('FUN').connection.typeExpr.return_type.clear();
    this.callClearTypes_('FUN');
    this.callClearTypes_('ARG');
  },

  infer: function(env) {
    var expected = this.outputConnection.typeExpr;
    var fun_expected = this.getInput('FUN').connection.typeExpr;
    var fun_type = this.callInfer_('FUN', env);
    var arg_type = this.callInfer_('ARG', env);
    if (fun_type)
      fun_type.unify(fun_expected);
    if (arg_type)
      arg_type.unify(fun_expected.arg_type);
    return expected;
  }
}

Blockly.Blocks['match_typed'] = {
  /**
   */
  init: function() {
    this.setColour(290);
    var A = Blockly.RenderedTypeExpr.generateTypeVar();
    var B = Blockly.RenderedTypeExpr.generateTypeVar();
    this.appendDummyInput()
        .appendField('match');
    this.appendValueInput('INPUT')
        .setTypeExpr(A);
    this.appendDummyInput()
        .appendField('with')
        .setAlign(Blockly.ALIGN_RIGHT);
    this.appendValueInput('PATTERN1')
        .setTypeExpr(A);
    this.appendValueInput('OUTPUT1')
        .setTypeExpr(B)
        .appendField('->')
        .setAlign(Blockly.ALIGN_RIGHT);
    this.appendValueInput('PATTERN2')
        .setTypeExpr(A);
    this.appendValueInput('OUTPUT2')
        .setTypeExpr(B)
        .appendField('->')
        .setAlign(Blockly.ALIGN_RIGHT);
    this.setOutput(true);
    this.setOutputTypeExpr(B);
    this.setInputsInline(false);
  },

  clearTypes: function() {
    this.outputConnection.typeExpr.clear();
    this.getInput('INPUT').connection.typeExpr.clear();
    this.callClearTypes_('INPUT');
    this.callClearTypes_('PATTERN1');
    this.callClearTypes_('PATTERN2');
    this.callClearTypes_('OUTPUT1');
    this.callClearTypes_('OUTPUT2');
  },

  infer: function(env) {
    var expected = this.outputConnection.typeExpr;
    var input_expected = this.getInput('INPUT').connection.typeExpr;
    var input_type = this.callInfer_('INPUT', env);
    var pattern1_type = this.callInfer_('PATTERN1', env);
    var pattern2_type = this.callInfer_('PATTERN2', env);
    var output1_type = this.callInfer_('OUTPUT1', env);
    var output2_type = this.callInfer_('OUTPUT2', env);
    if (input_type)
      input_type.unify(input_expected);
    if (pattern1_type)
      pattern1_type.unify(input_expected);
    if (pattern2_type)
      pattern2_type.unify(input_expected);
    if (output1_type)
      output1_type.unify(expected);
    if (output2_type)
      output2_type.unify(expected);
    return expected;
  }
}

/**
 * Typed variables
 */

Blockly.Blocks['variables_get_typed'] = {
  /**
   * Block for variable getter.
   * @this Blockly.Block
   */
  init: function() {
    var A = Blockly.RenderedTypeExpr.generateTypeVar();
    this.setHelpUrl(Blockly.Msg.VARIABLES_GET_HELPURL);
    this.setColour(330);
    this.appendDummyInput()
        .appendField(Blockly.Msg.VARIABLES_GET_TITLE)
        .appendField(Blockly.FieldBoundVariable.newReference(A), 'VAR')
        .appendField(Blockly.Msg.VARIABLES_GET_TAIL);
    this.setOutput(true);
    this.setOutputTypeExpr(A);
    this.setTooltip(Blockly.Msg.VARIABLES_GET_TOOLTIP);
  },

  /**
   * Update the type expressions of bound-variable fields on this block.
   * Would be called if the block's type expressions are replaced with other
   * ones, and a type expression this field's variable refers to is no longer
   * up-to-date.
   */
  typeExprReplaced: function() {
    var A = this.outputConnection.typeExpr;
    var field = this.getField('VAR');
    var variable = field.getVariable();
    variable.setTypeExpr(A);
  },

  /**
   * Notification that a variable is renaming.
   * If the name matches one of this block's variables, rename it.
   * @param {string} oldName Previous name of variable.
   * @param {string} newName Renamed variable.
   * @this Blockly.Block
   */
  renameVar: function(oldName, newName) {
    if (Blockly.Names.equals(oldName, this.getField('VAR').getText())) {
      this.setFieldValue(newName, 'VAR');
    }
  },

  /**
   * Add menu option to create getter/setter block for this setter/getter.
   * @param {!Array} options List of menu options to add to.
   * @this Blockly.Block
   */
  customContextMenu: function(options) {
    var option = {enabled: true};
    var name = this.getField('VAR').getText();
    option.text = Blockly.Msg.VARIABLES_SET_CREATE_GET.replace('%1', name);
    var xmlField = goog.dom.createDom('field', null, name);
    xmlField.setAttribute('name', 'VAR');
    var xmlBlock = goog.dom.createDom('block', null, xmlField);
    xmlBlock.setAttribute('type', 'variables_get_typed');
    option.callback = Blockly.ContextMenu.callbackFactory(this, xmlBlock);
    options.push(option);
  },

  clearTypes: function() {
    this.outputConnection.typeExpr.clear();
  },

  infer: function(env) {
    var var_name = this.getField('VAR').getText();
    var expected = this.outputConnection.typeExpr;
    if (var_name in env)
      env[var_name].unify(expected);
    return expected;
  }

};

Blockly.Blocks['let_typed'] = {
  /**
   * Block for let expression.
   * @this Blockly.Block
   */
  init: function() {
    this.setHelpUrl(Blockly.Msg.VARIABLES_SET_HELPURL);
    this.setColour(330);
    var A = Blockly.RenderedTypeExpr.generateTypeVar();
    var B = Blockly.RenderedTypeExpr.generateTypeVar();
    var variable_field = Blockly.FieldBoundVariable.newValue(A, 'EXP2');
    this.appendDummyInput('VARIABLE')
        .appendField('let')
        .appendField(variable_field, 'VAR');
    this.appendValueInput('EXP1')
        .setTypeExpr(A)
        .appendField('=');
    this.appendValueInput('EXP2')
        .setTypeExpr(B)
        .appendField('in');
    this.setMutator(new Blockly.Workbench());
    this.setOutput(true);
    this.setOutputTypeExpr(B);
    this.setInputsInline(true);
  },

  /**
   * Update the type expressions of bound-variable fields on this block.
   * Would be called if the block's type expressions are replaced with other
   * ones, and a type expression this field's variable refers to is no longer
   * up-to-date.
   */
  typeExprReplaced: function() {
    var A = this.getInput('EXP1').connection.typeExpr;
    var field = this.getField('VAR');
    var variable = field.getVariable();
    variable.setTypeExpr(A);
  },

  /**
   * Return all variables of which is declared in this block, and can be used
   * later the given connection's input.
   * @param {!Blockly.Connection} connection Connection to specify a scope.
   * @return {Object} Object mapping variable name to its variable
   *     representations.
   */
  getVisibleVariables: function(conn) {
    var exp2 = this.getInput('EXP2');
    var map = {};
    if (exp2.connection == conn) {
      var variable = this.typedValue['VAR'];
      var name = variable.getVariableName();
      map[name] = variable;
    }
    return map;
  },

  /**
   * Notification that a variable is renaming.
   * If the name matches one of this block's variables, rename it.
   * @param {string} oldName Previous name of variable.
   * @param {string} newName Renamed variable.
   * @this Blockly.Block
   */
  renameVar: function(oldName, newName) {
    if (Blockly.Names.equals(oldName, this.getField('VAR').getText())) {
      this.setFieldValue(newName, 'VAR');
    }
  },

  /**
   * Return a DOM tree of blocks to show in the workbench's flyout.
   * @return {Node} DOM tree of blocks.
   */
  getTreeInFlyout: function() {
    var xml = goog.dom.createDom('xml');
    var exp2 = this.getInput('EXP2');
    var env = this.allVisibleVariables(exp2.connection);

    var names = Object.keys(env);
    for (var i = 0, name; name = names[i]; i++) {
      var variable = env[name];
      var getterBlock = this.workspace.newBlock('variables_get_typed');
      var field = getterBlock.getField('VAR');
      field.setVariableName(name);
      field.setBoundValue(variable);
      var dom = Blockly.Xml.blockToDom(getterBlock);
      getterBlock.dispose();
      xml.appendChild(dom);
    }
    return xml;
  },

  /**
   * Add menu option to create getter/setter block for this setter/getter.
   * @param {!Array} options List of menu options to add to.
   * @this Blockly.Block
   */
  customContextMenu: function(options) {
    var option = {enabled: true};
    var name = this.getField('VAR').getText();
    option.text = Blockly.Msg.VARIABLES_GET_CREATE_SET.replace('%1', name);
    var xmlField = goog.dom.createDom('field', null, name);
    xmlField.setAttribute('name', 'VAR');
    var xmlBlock = goog.dom.createDom('block', null, xmlField);
    xmlBlock.setAttribute('type', 'let_typed');
    option.callback = Blockly.ContextMenu.callbackFactory(this, xmlBlock);
    options.push(option);
  },

  clearTypes: function() {
    this.getInput('EXP1').connection.typeExpr.clear();
    this.getInput('EXP2').connection.typeExpr.clear();
    this.callClearTypes_('EXP1');
    this.callClearTypes_('EXP2');
  },

  infer: function(env) {
    var var_name = this.getField('VAR').getText();
    var expected_exp1 = this.getInput('EXP1').connection.typeExpr;
    var expected_exp2 = this.getInput('EXP2').connection.typeExpr;
    var exp1 = this.callInfer_('EXP1', env);
    var env2 = Object.assign({}, env);
    env2[var_name] = expected_exp1;
    var exp2 = this.callInfer_('EXP2', env2);

    if (exp1)
      exp1.unify(expected_exp1);
    if (exp2)
      exp2.unify(expected_exp2);

    return expected_exp2;
  }
};

