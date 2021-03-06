/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is gContactSync.
 *
 * The Initial Developer of the Original Code is
 * Josh Geenen <gcontactsync@pirules.org>.
 * Portions created by the Initial Developer are Copyright (C) 2009-2016
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

/** Containing object for gContactSync */
var gContactSync = gContactSync || {};

window.addEventListener("load",
  /** Initializes the Accounts class when the window has finished loading */
  function gCS_AccountsLoadListener() {
    window.removeEventListener("load", gCS_AccountsLoadListener, false);
    gContactSync.Accounts.initDialog();
  },
false);

/**
 * The JavaScript variables and functions that handle different gContactSync
 * accounts allowing each synchronized address book to have its own preferences.
 * @class
 */
gContactSync.Accounts = {
  /** Stores whether there are any unsaved changes in the Accounts dialog */
  mUnsavedChange: false,
  /** The column index of the address book name
   * change this if adding a column before the AB name
   */
  mAbNameIndex:  0,
  /** Stores the URIs of the ABs displayed in the Accounts dialog's tree */
  mAbURIs: [],
  /** Element IDs used when changing the preferences */
  mPrefElemIDs: [
    "Username",
    "Groups",
    "Plugin",
    "SyncDirection",
    "skipContactsWithoutEmail",
    "updateGoogleInConflicts",
    "disabled"
  ],
  /**
   * Initializes the Accounts dialog by filling the tree of address books,
   * filling in the usernames, hiding the advanced settings, etc.
   */
  initDialog:  function Accounts_initDialog() {
    // This script is also included by the account setup wizard.
    // Only run these initialization functions on the account dialog.
    if (document.getElementById("loginTree") === null) {return;}
    try {
      this.fillAbTree();
      this.fillUsernames();
      this.selectedAbChange();
    }
    catch (e) {
      gContactSync.LOGGER.LOG_WARNING("Error in Accounts.initDialog", e);
    }
  },
  /**
   * Returns the GAddressBook corresponding to the currently-selected address
   * book in the accounts tree.
   * @returns {gContactSync.GAddressBook} A GAddressBook if one is selected, else false.
   */
  getSelectedAb: function Accounts_getSelectedAb() {
    var tree = document.getElementById("loginTree");
    if (tree.currentIndex < 0) {
      this.enablePreferences(false);
      return false;
    }
    this.enablePreferences(true);
    var ab = tree.currentIndex > -1 && tree.currentIndex < this.mAbURIs.length ?
              gContactSync.GAbManager.mABs[this.mAbURIs[tree.currentIndex]] :
              null;
    if (!ab) {
      return false;
    }
    return ab;
  },
  /**
   * Creates and returns a new address book after requesting a name for it.
   * If an AB of any type already exists this function will do nothing.
   * @returns {nsIAbDirectory} The new address book.
   */
  newAddressBook: function Accounts_newAddressBook() {
    var name = gContactSync.prompt(gContactSync.StringBundle.getStr("newABPrompt"), null, window);
    if (!name) {
      return false;
    }
    var ab = gContactSync.AbManager.getAbByName(name);
    this.fillAbTree();
    return ab;
  },
  /**
   * Saves the preferences for the selected address book.
   * @returns {boolean} True if the preferences were saved
   */
  saveSelectedAccount: function Accounts_saveSelectedAccount() {
    var usernameElem  = document.getElementById("Username"),
        groupElem     = document.getElementById("Groups"),
        directionElem = document.getElementById("SyncDirection"),
        pluginElem    = document.getElementById("Plugin"),
        disableElem   = document.getElementById("disabled"),
        skipCElem     = document.getElementById("skipContactsWithoutEmail"),
        updateGElem   = document.getElementById("updateGoogleInConflicts"),
        ab            = this.getSelectedAb();

    if (!ab || !usernameElem || !groupElem || !directionElem || !pluginElem || !disableElem) {
      return false;
    }

    var syncGroups = String(groupElem.value === "All"),
        myContacts = String(groupElem.value !== "All" && groupElem.value !== "false");
    // check if the AB should be reset based on the new values
    var needsReset = this.needsReset(ab, usernameElem.value, syncGroups, myContacts, groupElem.value, String(skipCElem.checked));

    // the simple preferences
    ab.savePref("Username",                 usernameElem.value);
    ab.savePref("Plugin",                   pluginElem.value);
    ab.savePref("Disabled",                 String(disableElem.checked));
    ab.savePref("skipContactsWithoutEmail", String(skipCElem.checked));
    ab.savePref("updateGoogleInConflicts",  String(updateGElem.checked));
    // this is for backward compatibility
    ab.savePref("Primary",  "true");
    // Group to sync
    ab.savePref("syncGroups",     syncGroups);
    ab.savePref("myContacts",     myContacts);
    ab.savePref("myContactsName", groupElem.value);
    // Sync Direction
    ab.savePref("writeOnly", String(directionElem.value === "WriteOnly"));
    ab.savePref("readOnly",  String(directionElem.value === "ReadOnly"));

    // reset the unsaved change
    this.mUnsavedChange = false;
    this.fillUsernames();
    this.fillAbTree();
    this.selectedAbChange();

    if (needsReset) {
      ab.reset();
      gContactSync.Preferences.setSyncPref("needRestart", true);
      var restartStr = gContactSync.StringBundle.getStr("pleaseRestart");
      gContactSync.Preferences.setSyncPref("statusBarText", restartStr);
      gContactSync.alert(gContactSync.StringBundle.getStr("finishedAcctSave"));
    } else {
      gContactSync.alert(gContactSync.StringBundle.getStr("finishedAcctSaveNoRestart"));
    }
    return true;
  },
  /**
   * Enables or disables the preference elements.
   * @param aEnable {boolean} Set to true to enable elements or false to disable
   *                          them.
   */
  enablePreferences: function Accounts_enablePreferences(aEnable) {
    var elem, i;
    for (i = 0; i < this.mPrefElemIDs.length; i++) {
      elem = document.getElementById(this.mPrefElemIDs[i]);
      if (!elem) {
        gContactSync.LOGGER.LOG_WARNING(this.mPrefElemIDs[i] + " not found");
        continue;
      }
      elem.disabled = aEnable ? false : true;
    }
  },
  /**
   * Called when the selected address book changes in the accounts tree.
   * @returns {boolean} true if there is currently an address book selected.
   */
  selectedAbChange: function Accounts_selectedAbChange() {
    var usernameElem  = document.getElementById("Username"),
        groupElem     = document.getElementById("Groups"),
        directionElem = document.getElementById("SyncDirection"),
        pluginElem    = document.getElementById("Plugin"),
        disableElem   = document.getElementById("disabled"),
        skipCElem     = document.getElementById("skipContactsWithoutEmail"),
        updateGElem   = document.getElementById("updateGoogleInConflicts"),
        ab            = this.getSelectedAb();
    this.restoreGroups();
    if (!usernameElem || !groupElem || !directionElem || !pluginElem || !disableElem || !ab) {
      return false;
    }
    // Username/Account
    this.fillUsernames(ab.mPrefs.Username);
    // Group
    // The myContacts pref (enable sync w/ one group) has priority
    // If that is checked an the myContactsName is pref sync just that group
    // Otherwise sync all or no groups based on the syncGroups pref
    var group = ab.mPrefs.myContacts ?
               (ab.mPrefs.myContactsName ? ab.mPrefs.myContactsName : "false") :
               (ab.mPrefs.syncGroups !== "false" ? "All" : "false");
    gContactSync.selectMenuItem(groupElem, group, true);
    // Sync Direction
    var direction = ab.mPrefs.readOnly === "true" ? "ReadOnly" :
                      ab.mPrefs.writeOnly === "true" ? "WriteOnly" : "Complete";
    gContactSync.selectMenuItem(directionElem, direction, true);
    // Temporarily disable synchronization with the address book
    disableElem.checked = ab.mPrefs.Disabled === "true";
    skipCElem.checked = ab.mPrefs.skipContactsWithoutEmail === "true";
    // Overwrite remote changes with local changes in a conflict
    updateGElem.checked = ab.mPrefs.updateGoogleInConflicts === "true";
    // Select the correct plugin
    gContactSync.selectMenuItem(pluginElem, ab.mPrefs.Plugin, true);
    
    return true;
  },
  /**
   * Fills the 'Username' menulist with all the usernames of the current plugin.
   * @param aDefault {string} The default account to select.  If not present or
   *                          evaluating to 'false' then 'None' will be
   *                          selected.
   */
  fillUsernames: function Accounts_fillUsernames(aDefault) {
    var usernameElem = document.getElementById("Username"),
        tokens       = gContactSync.LoginManager.getAuthTokens(),
        item,
        username,
        index = -1;
    if (!usernameElem) {
      return false;
    }
    // Remove all existing logins from the menulist
    usernameElem.removeAllItems();

    usernameElem.appendItem(gContactSync.StringBundle.getStr("noAccount"), "none");
    // Add a menuitem for each account with an auth token
    for (username in tokens) {
      item = usernameElem.appendItem(username, username);
      if (aDefault === username && aDefault !== undefined) {
        index = usernameElem.menupopup.childNodes.length - 1;
      }
    }

    if (index > -1) {
      usernameElem.selectedIndex = index;
    }
    // if the default value isn't in the menu list, add & select it
    // this can happen when an account is added through one version of the
    // login manager and the Accounts dialog was opened in another
    // This isn't retained (for now?) to prevent anyone from setting up a new
    // synchronized account with it and expecting it to work.
    else if (aDefault) {
      gContactSync.selectMenuItem(usernameElem, aDefault, true);
    }
    // Otherwise select None
    else {
      usernameElem.selectedIndex = 0;
    }

    return true;
  },
  /**
   * Populates the address book tree with all Personal/Mork Address Books
   */
  fillAbTree: function Accounts_fillAbTree() {
    var tree          = document.getElementById("loginTree"),
        treechildren  = document.getElementById("loginTreeChildren"),
        newTreeChildren,
        abs,
        i;
  
    if (treechildren) {
      try { tree.removeChild(treechildren); } catch (e) {}
    }
    this.mAbURIs = [];
    newTreeChildren = document.createElement("treechildren");
    newTreeChildren.setAttribute("id", "loginTreeChildren");
    tree.appendChild(newTreeChildren);

    // Get all Personal/Mork DB Address Books (type == 2,
    // see mailnews/addrbook/src/nsDirPrefs.h)
    // TODO - there should be a way to change the allowed dir types...
    abs = gContactSync.GAbManager.getAllAddressBooks(2);
    for (i in abs) {
      if (abs[i] instanceof gContactSync.GAddressBook) {
        this.addToTree(newTreeChildren, abs[i]);
      }
    }
    return true;
  },
  /**
   * Adds login information (username and directory name) to the tree.
   * @param aTreeChildren {object} The <treechildren> XUL element.
   * @param aAB           {GAddressBook} The GAddressBook to add.
   */
  addToTree: function Accounts_addToTree(aTreeChildren, aAB) {
    if (!aAB || !aAB instanceof gContactSync.GAddressBook) {
      throw "Error - Invalid AB passed to addToTree";
    }
    var treeitem    = document.createElement("treeitem"),
        treerow     = document.createElement("treerow"),
        addressbook = document.createElement("treecell"),
        synced      = document.createElement("treecell");

    addressbook.setAttribute("label", aAB.getName());
    synced.setAttribute("label",      aAB.mPrefs.Username ||
                                      gContactSync.StringBundle.getStr("noAccount"));

    treerow.appendChild(addressbook);
    treerow.appendChild(synced);
    treeitem.appendChild(treerow);
    aTreeChildren.appendChild(treeitem);
    
    this.mAbURIs.push(aAB.mURI);

    return true;
  },
  /**
   * Shows an alert dialog that briefly explains the synchronization direction
   * preference.
   */
  directionPopup: function Accounts_directionPopup() {
    gContactSync.alert(gContactSync.StringBundle.getStr("directionPopup")); 
  },
  /**
   * Restores the Groups menulist to contain only the default groups.
   */
  restoreGroups: function Accounts_restoreGroups() {
    var groupElem = document.getElementById("Groups");
    for (var i = 0; i < groupElem.itemCount;) {
      if (groupElem.getItemAtIndex(i).getAttribute("class") != "default") {
        groupElem.removeItemAt(i);
      } else {
        ++i;
      }
    }
    var groupsElem = document.getElementById("Groups");
    if (groupsElem.selectedIndex >= groupsElem.itemCount) {
      groupsElem.selectedIndex = 2;
    }
  },
  /**
   * Fetch all groups for the selected account and add custom groups to the
   * menulist.
   */
  getAllGroups: function Accounts_getAllGroups(aUsername) {
    this.restoreGroups();
    if (!aUsername || aUsername === "none") {
      return false;
    }
    var token = gContactSync.LoginManager.getAuthTokens()[aUsername];
    if (!token) {
      gContactSync.LOGGER.LOG_WARNING("Unable to find the token for username " + aUsername);
      return false;
    }
    this.getAccessToken(token, aUsername);
    return true;
  },
  /**
   * Exchanges the refresh token for an access token.  On success, continues synchronization.
   *
   * @param aRefreshToken {string} A refresh token.
   */
  getAccessToken: function Accounts_getAccessToken(aRefreshToken, aUsername) {
    gContactSync.LOGGER.VERBOSE_LOG("Requesting access token");
    // Fetch an access token from the refresh token
    var request = new gContactSync.GHttpRequest("REFRESH_REQUEST", aRefreshToken);
    request.mOnSuccess = function getAccessTokenSuccess(aHttpRequest) {
      var response = JSON.parse(aHttpRequest.responseText);
      var accessToken = response.token_type + " " + response.access_token;
      gContactSync.Accounts.sendGetGroupsRequest(accessToken, aUsername);
    };
    request.mOnError = function getAccessTokenError(httpReq) {
      gContactSync.LOGGER.LOG_WARNING(httpReq.responseText);
    };
    request.mOnOffline = null;
    request.send();
  },
  /**
   * Sends the request to get the groups for a given username.
   *
   * @param aAccessToken {string} The access token.
   * @param aUsername {string The username.
   */
  sendGetGroupsRequest: function Accounts_finishGetAllGroups(aAccessToken, aUsername) {
    gContactSync.LOGGER.VERBOSE_LOG("Fetching groups for username: " + aUsername);
    var httpReq = new gContactSync.GHttpRequest("getGroups",
                                                    aAccessToken,
                                                    null,
                                                    null);
    httpReq.mOnSuccess = function getAllGroupsSuccess(httpReq) {
      gContactSync.LOGGER.VERBOSE_LOG(gContactSync.serializeFromText(httpReq.responseText));
      gContactSync.Accounts.addGroups(httpReq.responseXML, aUsername);
    };
    httpReq.mOnError   = function getAllGroupsError(httpReq) {
      gContactSync.LOGGER.LOG_WARNING(httpReq.responseText);
    };
    httpReq.mOnOffline = null;
    httpReq.send();
  },
  /**
   * Adds groups in the given atom feed to the Groups menulist provided the
   * username hasn't changed since the groups request was sent and the username
   * isn't blank.
   */
  addGroups: function Accounts_addGroups(aAtom, aUsername) {
    var usernameElem  = document.getElementById("Username"),
        menulistElem  = document.getElementById("Groups"),
        group,
        title,
        i,
        arr;
    if (!aAtom) {
      return false;
    }
    if (usernameElem !== null && (usernameElem.value === "none" || usernameElem.value !== aUsername)) {
      return false;
    }
    arr = aAtom.getElementsByTagNameNS(gContactSync.gdata.namespaces.ATOM.url, "entry");
    gContactSync.LOGGER.VERBOSE_LOG("Adding groups from username: " + aUsername);
    var names = [];
    for (i = 0; i < arr.length; i++) {
      group = new gContactSync.Group(arr[i]);
      title = group.getTitle();
      gContactSync.LOGGER.VERBOSE_LOG(" * " + title);
      // don't add system groups again
      if (!title || group.isSystemGroup()) {
        gContactSync.LOGGER.VERBOSE_LOG("    - Skipping system group");
      }
      else {
        names.push(title);
      }
    }
    
    // Sort the group names, but only the non-system groups similar to how
    // Google Contacts sorts them.
    names.sort();
    // Now add the group names to the Groups menulist
    for (i = 0; i < names.length; i++) {
      menulistElem.appendItem(names[i], names[i]);
    }
    return true;
  },
  /**
   * Returns whether the given address book should be reset and prompts the user
   * before returning true.
   * Resetting an address book is necessary when ALL of the following
   * conditions marked with * are met:
   *  * The username was NOT originally blank
   *  * The new username is NOT blank
   *  * The last sync date of the AB is > 0
   *  * The user agrees that the AB should be reset (using a confirm dialog)
   *  * AND at least one of the following is true:
   *    o The username has changed (and wasn't originally blank)
   *    o OR The group to sync has been changed
   *
   * @param aAB {string}              The GAddressBook being modified.  If this
   *                                  function returns true this AB should be
   *                                  reset.
   * @param aUsername {string}        The new username for the account with
   *                                  which aAB will be synchronized.
   * @param aSyncGroups {string}      The new value for the syncGroups pref.
   * @param aMyContacts {string}      The new value for the myContacts pref.
   * @param aMyContactsName {string}  The new value for the myContactsName pref.
   * @param aSkipContacts {boolean}   The new value for the skipContactsWithoutEmail pref.
   *
   * @return {boolean} true if the AB should be reset.  See the detailed
   *                        description for more details.
   */
  needsReset: function Accounts_needsReset(aAB, aUsername, aSyncGroups, aMyContacts, aMyContactsName, aSkipContacts) {
    // This should not be necessary, but it's better to be safe
    aAB.getPrefs();
    gContactSync.LOGGER.VERBOSE_LOG
      (
       "**Determining if the address book '" + aAB.getName() +
       "' should be reset:\n" +
      "  * " + aUsername       + " <- " + aAB.mPrefs.Username + "\n" +
      "  * " + aSyncGroups     + " <- " + aAB.mPrefs.syncGroups + "\n" +
      "  * " + aMyContacts     + " <- " + aAB.mPrefs.myContacts + "\n" +
      "  * " + aMyContactsName + " <- " + aAB.mPrefs.myContactsName + "\n" +
      "  * " + aSkipContacts + " <- " + aAB.mPrefs.skipContactsWithoutEmail + "\n" +
      "  * Last sync date: " + aAB.mPrefs.lastSync
     );
    if ((aAB.mPrefs.Username && aAB.mPrefs.Username !== "none") &&
         aUsername !== "none" &&
         parseInt(aAB.mPrefs.lastSync, 10) > 0 &&
         (
          aAB.mPrefs.Username !== aUsername ||
          aAB.mPrefs.syncGroups !== aSyncGroups ||
          aAB.mPrefs.myContacts !== aMyContacts ||
          aAB.mPrefs.myContactsName !== aMyContactsName ||
          aAB.mPrefs.skipContactsWithoutEmail !== aSkipContacts
         )) {
      var reset = gContactSync.confirm(gContactSync.StringBundle.getStr("confirmABReset"));
      gContactSync.LOGGER.VERBOSE_LOG("  * Confirmation result: " + reset + "\n");
      return reset;
    }
    gContactSync.LOGGER.VERBOSE_LOG("  * The AB will NOT be reset\n");
    return false;
  },
  /**
   * This method is called when the user clicks the Accept button
   * (labeled Close) or when acceptDialog() is called.
   * If there are unsaved changes it will let the user save changes if
   * desired.
   * @returns {boolean} Always returns true (close the dialog).
   */
  close: function Accounts_close() {
    if (this.mUnsavedChange &&
        gContactSync.confirm(gContactSync.StringBundle.getStr("unsavedAcctChanges"))) {
      this.saveSelectedAccount();
    }
    return true;
  }
};
