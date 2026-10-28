// Ouvre le panneau au clic ; vérifie l'annuaire toutes les 30 minutes et affiche « +N » sur l'icône
// quand de nouveaux comptes y ont été ajoutés depuis la dernière ouverture du panneau.
const ANNUAIRE = 'https://onbloquelextremedroite.fun';

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('panneau.html') });
});

// Recréer l'alarme du même nom la remplace : pas de doublon.
const programmer = () => chrome.alarms.create('annuaire', { periodInMinutes: 30 });
chrome.runtime.onInstalled.addListener(programmer);
chrome.runtime.onStartup.addListener(programmer);

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name !== 'annuaire') return;
  try {
    const r = await fetch(ANNUAIRE + '/api/accounts', { cache: 'no-store', credentials: 'include' });
    if (!r.ok) return; // protection anti-robot : on réessaiera, le panneau sait la contourner
    // Même compte que chargerListe() (entreesAnnuaire), enregistré par le panneau dans vuAnnuaire.
    const n = (await r.json()).entries.filter((e) => e.type === 'new').length;
    const { vuAnnuaire } = await chrome.storage.local.get('vuAnnuaire');
    const ajouts = n - (vuAnnuaire || n);
    if (ajouts > 0) {
      chrome.action.setBadgeBackgroundColor({ color: '#e8ff59' });
      chrome.action.setBadgeTextColor?.({ color: '#16171a' });
      chrome.action.setBadgeText({ text: '+' + ajouts });
      chrome.action.setTitle({ title: `${ajouts} nouveaux comptes dans l'annuaire` });
    }
  } catch (e) { /* hors ligne */ }
});
