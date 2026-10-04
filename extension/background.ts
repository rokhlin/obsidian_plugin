/**
 * Background Service Worker for Manifest V3 Obsidian Companion Extension.
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log("Obsidian Companion Extension installed.");
});
