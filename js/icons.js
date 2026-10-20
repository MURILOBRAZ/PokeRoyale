// Ícones em pixel art no lugar dos emojis (assets/icones, gerados por tools/build-icons.py).
// Os textos do jogo continuam escritos com emojis; aqui eles viram <img> sozinhos, em qualquer
// lugar da página (inclusive o que é criado depois, como banners e listas), por um MutationObserver.
// Na arena (canvas), render.js desenha os ícones com drawIcon().

const EMOJI_ICONS = {
  '🏆': 'trophy', '🪙': 'coin', '💰': 'money', '🔒': 'lock', '⚔': 'swords', '👑': 'crown',
  '🎯': 'target', '🌐': 'globe', '👥': 'friends', '⏳': 'hourglass', '⚡': 'bolt', '🏳': 'flag',
  '🔊': 'sound', '🔇': 'mute', '🚪': 'door', '🛒': 'cart', '🏅': 'medal', '🏰': 'castle',
  '💥': 'boom', '❤': 'heart', '💚': 'heal', '💫': 'dizzy', '💬': 'chat', '🏠': 'home', '➕': 'plus',
  '🌿': 'leaf', '📜': 'scroll', '🎵': 'note', '🎲': 'dice', '🦇': 'bat', '👟': 'shoe', '✨': 'sparkles',
  '🥇': 'gold', '🥈': 'silver', '🥉': 'bronze', '🤖': 'robot', '🎁': 'gift', '💢': 'anger',
  '🪨': 'rock', '🏃': 'run', '🏷': 'tag', '🎉': 'party', '⭐': 'star', '🍓': 'berry',
  '🃏': 'pokedex', '↩': 'back',
};

const iconUrl = (name) => `assets/icones/${name}.png`;

const EMOJI_RE = new RegExp(`(${Object.keys(EMOJI_ICONS).join('|')})\\uFE0F?`, 'gu');
const EMOJI_TEST = new RegExp(EMOJI_RE.source, 'u'); // sem 'g': test() não guarda posição entre chamadas
// Onde não dá para pôr imagem (opções de select, campos de texto, etc.)
const NO_ICON_TAGS = new Set(['OPTION', 'SELECT', 'TEXTAREA', 'INPUT', 'SCRIPT', 'STYLE', 'TITLE']);

function iconImg(emoji, name) {
  const img = document.createElement('img');
  img.className = 'ico';
  img.src = iconUrl(name);
  img.alt = emoji; // copiar o texto continua trazendo o emoji
  img.draggable = false;
  return img;
}

function pixelizeText(node) {
  const text = node.nodeValue;
  if (!text || !EMOJI_TEST.test(text)) return;
  const parent = node.parentNode;
  if (!parent || NO_ICON_TAGS.has(parent.nodeName)) return;
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of text.matchAll(EMOJI_RE)) {
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    frag.appendChild(iconImg(m[0], EMOJI_ICONS[m[1]]));
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  // Em flex/grid, cada pedaço viraria um item separado (com espaço entre eles): agrupa num <span>
  const display = parent.nodeType === Node.ELEMENT_NODE ? getComputedStyle(parent).display : '';
  if (/flex|grid/.test(display)) {
    const span = document.createElement('span');
    span.className = 'ico-text';
    span.appendChild(frag);
    parent.replaceChild(span, node);
    return;
  }
  parent.replaceChild(frag, node);
}

function pixelize(root) {
  if (root.nodeType === Node.TEXT_NODE) return pixelizeText(root);
  if (root.nodeType !== Node.ELEMENT_NODE || NO_ICON_TAGS.has(root.nodeName)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(pixelizeText);
}

pixelize(document.body);
new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.type === 'characterData') pixelize(m.target);
    else m.addedNodes.forEach(pixelize);
  }
}).observe(document.body, { childList: true, subtree: true, characterData: true });
