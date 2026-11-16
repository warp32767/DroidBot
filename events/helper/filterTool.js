const fs = require('fs');
const path = require('path');

// INVISIBLE / SEPARATOR CHARACTERS
// Stripped from message content before any matching occurs.
// Covers zero-width spaces, joiners, directional marks, soft hyphens, etc.

const INVISIBLE_CHARS = [
    //  C0 CONTROL CODES (Non-printing)
    '\u0000', '\u0001', '\u0002', '\u0003', '\u0004', '\u0005', '\u0006', '\u0007',
    '\u0008', '\u000E', '\u000F', '\u0010', '\u0011', '\u0012', '\u0013', '\u0014',
    '\u0015', '\u0016', '\u0017', '\u0018', '\u0019', '\u001A', '\u001B', '\u001C',
    '\u001D', '\u001E', '\u001F', '\u007F',

    // ORIGINALS / JOINERS / MARKS
    '\u00AD', // SOFT HYPHEN
    '\u034F', // COMBINING GRAPHEME JOINER
    '\u061C', // ARABIC LETTER MARK
    '\u115F', // HANGUL CHOSEONG FILLER
    '\u1160', // HANGUL JUNGSEONG FILLER
    '\u17B4', // KHMER VOWEL INHERENT AQ
    '\u17B5', // KHMER VOWEL INHERENT AA
    '\u180B', // MONGOLIAN FREE VARIATION SELECTOR ONE
    '\u180C', // MONGOLIAN FREE VARIATION SELECTOR TWO
    '\u180D', // MONGOLIAN FREE VARIATION SELECTOR THREE
    '\u180E', // MONGOLIAN VOWEL SEPARATOR
    '\u200B', // ZERO WIDTH SPACE
    '\u200C', // ZERO WIDTH NON-JOINER
    '\u200D', // ZERO WIDTH JOINER
    '\u200E', // LEFT-TO-RIGHT MARK
    '\u200F', // RIGHT-TO-LEFT MARK
    '\u2028', // LINE SEPARATOR
    '\u2029', // PARAGRAPH SEPARATOR
    '\u202A', // LEFT-TO-RIGHT EMBEDDING
    '\u202B', // RIGHT-TO-LEFT EMBEDDING
    '\u202C', // POP DIRECTIONAL FORMATTING
    '\u202D', // LEFT-TO-RIGHT OVERRIDE
    '\u202E', // RIGHT-TO-LEFT OVERRIDE
    '\u2060', // WORD JOINER
    '\u2061', // FUNCTION APPLICATION
    '\u2062', // INVISIBLE TIMES
    '\u2063', // INVISIBLE SEPARATOR
    '\u2064', // INVISIBLE PLUS
    '\u2065', // UNASSIGNED / INVISIBLE
    '\u2066', // LEFT-TO-RIGHT ISOLATE
    '\u2067', // RIGHT-TO-LEFT ISOLATE
    '\u2068', // FIRST STRONG ISOLATE
    '\u2069', // POP DIRECTIONAL ISOLATE
    '\u206A', // INHIBIT SYMMETRIC SWAPPING
    '\u206B', // ACTIVATE SYMMETRIC SWAPPING
    '\u206C', // INHIBIT ARABIC FORM SHAPING
    '\u206D', // ACTIVATE ARABIC FORM SHAPING
    '\u206E', // NATIONAL DIGIT SHAPES
    '\u206F', // NOMINAL DIGIT SHAPES

    // C1 CONTROL CODES
    '\u0080', '\u0081', '\u0082', '\u0083', '\u0084', '\u0085', '\u0086', '\u0087',
    '\u0088', '\u0089', '\u008A', '\u008B', '\u008C', '\u008D', '\u008E', '\u008F',
    '\u0090', '\u0091', '\u0092', '\u0093', '\u0094', '\u0095', '\u0096', '\u0097',
    '\u0098', '\u0099', '\u009A', '\u009B', '\u009C', '\u009D', '\u009E', '\u009F',

    // VARIATION SELECTORS
    '\uFE00', '\uFE01', '\uFE02', '\uFE03', '\uFE04', '\uFE05', '\uFE06', '\uFE07',
    '\uFE08', '\uFE09', '\uFE0A', '\uFE0B', '\uFE0C', '\uFE0D', '\uFE0E', '\uFE0F',

    // WHITESPACE / FILLERS / SPECIALS
    '\u00A0', // NON-BREAKING SPACE
    '\u1680', // OGHAM SPACE MARK
    '\u202F', // NARROW NO-BREAK SPACE
    '\u205F', // MEDIUM MATHEMATICAL SPACE
    '\u2800', // BRAILLE PATTERN BLANK
    '\u3000', // IDEOGRAPHIC SPACE
    '\u3164', // HANGUL FILLER
    '\uFEFF', // ZERO WIDTH NO-BREAK SPACE (BOM)
    '\uFFA0', // HALFWIDTH HANGUL FILLER
    '\uFFF9', // INTERLINEAR ANNOTATION ANCHOR
    '\uFFFA', // INTERLINEAR ANNOTATION SEPARATOR
    '\uFFFB', // INTERLINEAR ANNOTATION TERMINATOR
    '\uFFFC', // OBJECT REPLACEMENT CHARACTER

    // PLANE 14 TAGS (Shorthand for common ones)
    '\u{E0001}', '\u{E0020}', '\u{E0021}', '\u{E0022}', '\u{E0023}', '\u{E0024}',
    '\u{E0025}', '\u{E0026}', '\u{E0027}', '\u{E0028}', '\u{E0029}', '\u{E002A}',
    '\u{E002B}', '\u{E002C}', '\u{E002D}', '\u{E002E}', '\u{E002F}', '\u{E0030}',
    '\u{E007F}',
];

const INVISIBLE_RE = new RegExp(
    '[' + INVISIBLE_CHARS.map(c => {
        const code = c.codePointAt(0).toString(16).padStart(4, '0');
        return '\\u{' + code + '}';
    }).join('') +
    '\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]',
    'gu'
);

// SUBSTITUTION MAP
// Each key is a lowercase Latin letter. Value is a character class string
// covering some Unicode homoglyphs and confusables for that letter. (i dont know maybe we can add more later)

const substitutions = {
    'a': '[aAаАᴀÀÁÂÃÄÅàáâãäåĀāĂăĄąǍǎȀȁȂȃȦȧᵃⱥ@4ΑАᎪꓮꭺᗅⓐ⒜🅐🅰⍺ꜵ🇦𝐚𝑎𝒂𝒶𝓪𝔞𝕒𝖆𝖺𝗮𝘢𝙖𝚊]',
    'b': '[bBвВЬьбᵇʙƁɓ8ᏏᏴḂḃⓑ⒝🅑🅱ƀƃƅꞖ🇧𝐛𝑏𝒃𝒷𝓫𝔟𝕓𝖇𝖻𝗯𝘣𝙗𝚋]',
    'c': '[cCсСϲϹċĊčČćĆçÇȼȻɕᴄⓒ⒞🅒🅲ℭℂⲥꮯ🇨𝐜𝑐𝒄𝒸𝓬𝔠𝕔𝖈𝖼𝗰𝘤𝙘𝚌]',
    'd': '[dDԁᴅđĐďĎȡδⓓ⒟🅓🅳ⅆↁⱰ🇩𝐝𝑑𝒅𝒹𝓭𝔡𝕕𝖉𝖽𝗱𝘥𝙙𝚍]',
    'e': '[eEеЕɛεèéêëēĕėęěȅȇȩḕḗḙḛḝẹẻẽ3℮ꓰꮛⓔ⒠🅔🅴ℯℰƐℇꫀ🇪𝐞𝑒𝒆𝓮𝔢𝕖𝖊𝖾𝗲𝘦𝙚𝚎]',
    'f': '[fFғᶠḟḞƒꞙⓕ⒡🅕🅵ℱⅎ🇫𝐟𝑓𝒇𝒻𝓯𝔣𝕗𝖋𝖿𝗳𝘧𝙛𝚏]',
    'g': '[gGɡɢĝĞğġĠģǦǧǴǵḡɠ6ⓖ⒢🅖🅶ƍꮐ🇬𝔤𝐠𝑔𝒈ℊ𝓰𝕘𝖌𝗀𝗴颗粒𝙜𝚐]',
    'h': '[hHʜнНһΗĥĦħȟḣḥḧḩḫɦ#ⓗ⒣🅗🅷ℋℌℍⱧ🇭𝐡ℎ𝒉𝒽𝓱𝔥𝕙𝖍𝗁𝗵𝘩𝙝𝚑]',
    'i': '[iIіІΙιɪìíîïīĭįıǐȉȋḭḯỉị1!¡;偏|ℐℑⓘ⒤🅘🅸ℹƖꙇ🇮𝐢𝑖𝒊𝒾𝓲𝔦𝕚𝖎𝗂𝗶𝘪𝙞𝚒]',
    'j': '[jJϳɉʝĵǰȷⓙ⒥🅙🅹🇯𝐣𝑗𝒋𝒿𝓳𝔧𝕛𝖏𝗃𝗷𝘫𝙟𝚓]',
    'k': '[kKκϰкКᴋĸķĶǩḱḳḵƙⓚ⒦🅚🅺K₭🇰𝐤𝑘𝒌𝓀𝓴𝔨𝕜𝖐𝗄𝗸𝘬𝙠𝚔]',
    'l': '[lLӏĺļľŀłƚḷḹḻḽɫɬɭ1|ℓꓡꮮᏞⓛ⒧🅛🅛ℒI🇱𝐥𝑙𝒍𝓁𝓵𝔩𝕝𝖑𝗅𝗹𝘭𝙡𝚕]',
    'm': '[mMмМΜμᴍḿṁṃɯɱⓜ⒨🅜🅼ℳⱮ🇲𝐦𝑚𝒎𝓂𝓶𝔪𝕞𝖒𝗆𝗺𝘮𝙢𝚖]',
    'n': '[nNиИΝνηпПñńņňǹȵṅṇṉṋɲɳⓝ⒩🅝🅽ℕℵŋ🇳𝐧𝑛𝒏𝓃𝓷𝔫𝕟𝖓𝗇𝗻𝘯𝙣𝚗]',
    'o': '[oOоОΟοøØõÕòóôöōŏőǒȍȏṍṏṑṓọỏ0σꓳꮎᎾ°ⓞ⒪🅞🅾ℴ⍥ⱺ🇴𝐨𝑜𝒐ℴ𝓸𝔬𝕠𝖔𝗈𝗼𝘰𝙤𝚘]',
    'p': '[pPрРΡρᴘṕṗƥⓟ⒫🅟🅿ℙƿꝑ🇵𝐩𝑝𝒑𝓅𝓹𝔭𝕡𝖕𝗉𝐩𝗽𝘱𝙥𝚙]',
    'q': '[qQɋϙԛⓠ⒬🅠🆀ℚʠ🇶𝐪𝑞𝒒𝓆𝓺𝔮𝕢𝖖𝗊𝗾𝘲𝙦𝚚]',
    'r': '[rRгГᴦʀŕŗřȑȓṙṛṝṟɾɼɽꓣꭱᏒⓡ⒭🅡🆁ℜℝℛƦ🇷𝐫𝑟𝒓𝓇𝓻𝔯𝕣𝖗𝗋𝗿𝘳𝙧𝚛]',
    's': '[sS$ѕЅśŝşšșṡṣṥṧṩȿ5ꓢꮪᏚⓢ⒮🅢🆂§ƨ🇸𝐬𝑠𝒔𝓈𝓼𝔰𝕤𝖘𝗌𝘀𝘴𝙨𝚜]',
    't': '[tTтТτΤṫṭṯṱțŧƫƭ7ꓔꮦᏆ+ⓣ⒯🅣🆃ƭ🇹𝐭𝑡𝒕𝓉𝓽𝔱𝕥𝖙𝗍𝘁𝘵𝙩𝚝]',
    'u': '[uUυʊμµùúûüūŭůűųǔȕȗṳṵṷṹṻụủứừửữựʉꓴꮜᑌⓤ⒰🅤🆄∪Ʋ⩌🇺𝐮𝑢𝒖𝓊𝓾𝔲𝕦𝖚𝗎𝘂𝘶𝒖𝚞]',
    'v': '[vVνѵᴠṽṿⅴꓥꮩᏉⓥ⒱🅥🆅∨℣🇻𝐯𝑣𝒗𝓋𝓿𝔳𝕧𝖛𝗏𝘃𝘃𝙫𝚟]',
    'w': '[wWωᴡẁẃẅẇẉꓪꮃᏔⓦ⒲🅦🆆₩ɯⱲ🇼𝐰𝑤𝒘𝓌𝔀𝔴𝕨𝖜𝗐𝘄𝘸𝙬𝚠]',
    'x': '[xXхХΧχẋẍ×ꓽꮂ᙭ⓧ⒳🅧🆇⨉ⲭ🇽𝐱𝑥𝒙𝓍𝔁𝔵𝕩𝖝𝗑𝘅𝘹𝙭𝚡]',
    'y': '[yYуУΥψýÿŷȳẏẙỳỵỷỹɣɏꓦꮍᎩⓨ⒴🅨🆈¥Ƴℽ🇾𝐲𝑦𝒚𝓎𝔂𝔶𝕪𝖞𝗒𝘆𝘺𝙮𝚢]',
    'z': '[zZΖζźżžẑẓẕƶȥɀ2ꓜꮓᏃⓩ⒵🅩🆉ℤℨⱿ🇿𝐳𝑧𝒛𝓏𝔃𝔷𝕫𝖟𝗓𝘇𝘻𝚣]',
};

// Build a reverse lookup for homoglyph normalization
const confusableToBase = {};
for (const [base, pattern] of Object.entries(substitutions)) {
    const inner = pattern.slice(1, -1);
    for (const ch of [...inner]) {
        if (ch && !(ch in confusableToBase)) {
            confusableToBase[ch] = base;
        }
    }
}

// HELPERS

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalize(text) {
    return text
        .replace(INVISIBLE_RE, '')
        .replace(/[\uFF01-\uFF5E]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .normalize('NFD')
        .replace(/[\u0300-\u036F\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/g, '')
        .replace(/[\u2010-\u2015\u2212\uFE63\uFF0D\u2014\u2013\.\,\!]/g, ' ')
        .toLowerCase()
        .replace(/./gsu, char => confusableToBase[char] ?? char)
        .replace(/(.)\1+/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

function compactText(text) {
    return normalize(text).replace(/\s+/g, '');
}

function compactPhrase(phrase) {
    return normalize(phrase).replace(/\s+/g, '');
}

function checkMessage(content) {
    const blocklistPath = path.join(__dirname, './blocklist.json');
    let blocklist;

    try {
        const blocklistData = fs.readFileSync(blocklistPath, 'utf8');
        blocklist = JSON.parse(blocklistData);
    } catch (error) {
        console.error('Error reading blocklist.json:', error);
        return { blocked: false };
    }

    const compactContent = compactText(content);

    if (!Array.isArray(blocklist)) return { blocked: false };
    for (const phrase of blocklist) {
        if (typeof phrase !== 'string') continue;
        const compactB = compactPhrase(phrase);
        if (compactB && compactContent.includes(compactB)) {
            return { blocked: true, match: phrase };
        }
    }

    return { blocked: false };
}

module.exports = { checkMessage, normalize };
