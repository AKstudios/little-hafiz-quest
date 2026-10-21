/*
 * Little Hafiz Quest: version chooser (runs first, before the page draws)
 * =====================================================================
 * The newest version opens by default. A family can pick the classic version from the version
 * badge on the start screen; the choice is remembered on this device (localStorage "lhq_channel")
 * and this script then opens that version's folder, for example v1/.
 * Opening the address with ?latest clears the choice (a way back if something goes wrong).
 */
(function () {
  'use strict';
  try {
    if (/[?&]latest\b/.test(location.search)) {
      localStorage.removeItem('lhq_channel');
      return;
    }
    var ch = localStorage.getItem('lhq_channel');
    if (ch && /^v[0-9]{1,3}$/.test(ch)) location.replace(ch + '/');
  } catch (e) {}
})();
