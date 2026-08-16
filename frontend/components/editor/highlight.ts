/**
 * Dependency-free syntax highlighter for the student Compiler page.
 *
 * One character scanner driven by a per-language `ModeSpec`, so adding a
 * language is a data change, not a code change. Emits `<span class="tok-*">`
 * markup that the compiler page's CSS module styles.
 *
 * Deliberately a *highlighter*, not a parser: it is wrong in the same harmless
 * ways every editor highlighter is wrong (nested template expressions, regex
 * literals vs division), and it never throws on malformed input.
 */

export type Mode =
  | 'python' | 'clike' | 'javascript' | 'sql'
  | 'shell'  | 'r'     | 'ruby'       | 'php'
  | 'matlab' | 'plain';

export type TokenType =
  | 'comment' | 'string' | 'number' | 'keyword' | 'type'
  | 'builtin' | 'preproc' | 'operator' | 'punct' | 'plain';

interface StringRule {
  open: string;
  close?: string;      // defaults to `open`
  escape?: boolean;    // backslash escapes (default true)
  multiline?: boolean; // may span newlines (default false)
}

interface ModeSpec {
  lineComment: string[];
  blockComment?: [string, string];
  strings: StringRule[];
  keywords: Set<string>;
  types: Set<string>;
  builtins: Set<string>;
  caseInsensitive?: boolean;
  preproc?: boolean;   // C-family `#include` / `#define` lines
}

const set = (words: string): Set<string> => new Set(words.trim().split(/\s+/));

// ── Language profiles ────────────────────────────────────────────────────────
// `clike` is a deliberate union of C, C++, C#, Java, Kotlin, Go, Rust and Swift.
// A playground highlighter gains nothing from eight near-identical tables, and
// a stray keyword coloured in the wrong dialect costs the student nothing.

const CLIKE: ModeSpec = {
  lineComment: ['//'],
  blockComment: ['/*', '*/'],
  strings: [
    { open: '"""', multiline: true },
    { open: '"' },
    { open: "'" },
    { open: '`', multiline: true },
  ],
  preproc: true,
  keywords: set(`
    if else for while do switch case default break continue return goto
    class struct enum union interface record namespace package import using
    public private protected internal static final const constexpr mutable
    virtual override abstract sealed partial extern inline explicit friend
    new delete this super base self nullptr null nil none typedef template
    typename operator sizeof alignof decltype typeid throw try catch finally
    thrown throws async await yield lock synchronized volatile transient
    fun val var let where when is as in out by object companion init
    constructor data sealed suspend lateinit reified crossinline noinline
    func defer go chan select range map make len cap append panic recover
    impl trait mod pub use crate mut ref move dyn unsafe match loop
    extension protocol guard repeat inout throws rethrows willSet didSet
    get set add remove event delegate params checked unchecked unsafe fixed
    stackalloc nameof var dynamic implicit explicit yield from with
  `),
  types: set(`
    int long short char float double void bool boolean byte signed unsigned
    string String Int Long Short Char Float Double Boolean Byte Unit Any
    i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 str
    size_t ssize_t uint8_t uint16_t uint32_t uint64_t int8_t int16_t int32_t int64_t
    var auto object decimal sbyte ushort uint ulong nint nuint
    vector list map set array string_view wstring pair tuple optional
    List Map Set Array Dictionary Optional Result Vec Box Rc Arc Option
  `),
  builtins: set(`
    true false True False null nil None NULL nullptr printf scanf puts putchar
    malloc calloc realloc free memcpy memset strlen strcpy strcmp sprintf
    cout cin cerr endl std println print printf format fmt Console System
    Math max min abs sqrt pow floor ceil round sort swap begin end size push_back
    toString equals hashCode valueOf length count String Integer Double Boolean
    Some Ok Err unwrap expect Vec HashMap panic assert require check error
  `),
};

const PYTHON: ModeSpec = {
  lineComment: ['#'],
  strings: [
    { open: '"""', multiline: true },
    { open: "'''", multiline: true },
    { open: '"' },
    { open: "'" },
  ],
  keywords: set(`
    def class lambda return yield if elif else for while break continue pass
    import from as with try except finally raise assert global nonlocal del
    and or not in is async await match case
  `),
  types: set(`
    int float str bool bytes bytearray complex list tuple dict set frozenset
    object type memoryview range slice
  `),
  builtins: set(`
    print input len range enumerate zip map filter sorted reversed sum min max
    abs round pow divmod any all open isinstance issubclass hasattr getattr
    setattr delattr repr format id hash iter next callable vars dir globals
    locals super staticmethod classmethod property self cls True False None
    Exception ValueError TypeError KeyError IndexError NameError ZeroDivisionError
    AttributeError StopIteration RuntimeError ImportError OSError __name__ __main__
  `),
};

const JAVASCRIPT: ModeSpec = {
  lineComment: ['//'],
  blockComment: ['/*', '*/'],
  strings: [{ open: '"' }, { open: "'" }, { open: '`', multiline: true }],
  keywords: set(`
    var let const function return if else for while do switch case default
    break continue new delete typeof instanceof in of this class extends super
    import export from as default async await yield try catch finally throw
    void with debugger get set static public private protected readonly
    interface type enum namespace declare abstract implements satisfies keyof
    infer is asserts override module require
  `),
  types: set(`
    string number boolean bigint symbol object any unknown never void null
    undefined Array Object Function String Number Boolean Symbol BigInt Promise
    Map Set WeakMap WeakSet Date RegExp Error JSON Math Record Partial Readonly
    Pick Omit Exclude Extract ReturnType Awaited
  `),
  builtins: set(`
    console log warn error info table process require module exports
    setTimeout setInterval clearTimeout clearInterval parseInt parseFloat
    isNaN isFinite encodeURIComponent decodeURIComponent structuredClone
    true false null undefined NaN Infinity globalThis window document fetch
    push pop shift unshift slice splice concat join map filter reduce forEach
    find findIndex includes indexOf keys values entries length
  `),
};

const SQL: ModeSpec = {
  lineComment: ['--', '#'],
  blockComment: ['/*', '*/'],
  strings: [{ open: "'" }, { open: '"' }, { open: '`' }],
  caseInsensitive: true,
  keywords: set(`
    select from where group by having order asc desc limit offset distinct
    insert into values update set delete truncate create alter drop table view
    index trigger database schema if exists not null primary key foreign
    references unique check default constraint cascade restrict
    join inner left right full outer cross on using union all intersect except
    as and or in between like glob is case when then else end with recursive
    begin commit rollback transaction pragma explain analyze vacuum attach
    detach replace conflict ignore returning autoincrement collate
  `),
  types: set(`
    integer int tinyint smallint mediumint bigint unsigned real double float
    numeric decimal boolean bool date datetime time timestamp text varchar
    char nchar nvarchar clob blob json serial money
  `),
  builtins: set(`
    count sum avg min max abs round ceil floor random length lower upper
    substr substring replace trim ltrim rtrim instr coalesce ifnull nullif
    group_concat total changes last_insert_rowid printf strftime julianday
    date_trunc now current_date current_time current_timestamp cast row_number
    rank dense_rank over partition
  `),
};

const SHELL: ModeSpec = {
  lineComment: ['#'],
  strings: [{ open: '"', multiline: true }, { open: "'", multiline: true }],
  keywords: set(`
    if then elif else fi for while until do done case esac in function select
    time return break continue exit local export readonly declare typeset
    shift trap set unset eval exec source alias unalias let coproc
  `),
  types: set(''),
  builtins: set(`
    echo printf read cd pwd ls cp mv rm mkdir rmdir touch cat head tail grep
    egrep sed awk cut sort uniq wc tr find xargs tee seq test true false
    basename dirname date sleep kill ps env which type command hash umask
    wait jobs bg fg getopts mapfile readarray printenv chmod chown ln diff
  `),
};

const R: ModeSpec = {
  lineComment: ['#'],
  strings: [{ open: '"', multiline: true }, { open: "'", multiline: true }],
  keywords: set(`
    if else for while repeat break next function return in switch
    library require source invisible on.exit tryCatch stop warning message
    TRUE FALSE NULL NA NA_integer_ NA_real_ NA_character_ Inf NaN
  `),
  types: set(`
    numeric integer character logical complex double raw factor list vector
    matrix array data.frame tibble Date POSIXct
  `),
  builtins: set(`
    c cat print paste paste0 sprintf format seq seq_len seq_along rep length
    nrow ncol dim names colnames rownames head tail summary str class typeof
    is.na is.null as.numeric as.integer as.character as.factor as.logical
    sum mean median sd var min max range round signif abs sqrt exp log
    apply lapply sapply vapply mapply tapply Reduce Filter Map do.call
    sort order rev unique table which ifelse subset merge rbind cbind
    matrix array factor levels read.csv write.csv plot hist boxplot set.seed
  `),
};

const RUBY: ModeSpec = {
  lineComment: ['#'],
  strings: [{ open: '"', multiline: true }, { open: "'", multiline: true }],
  keywords: set(`
    def end class module if elsif else unless while until for in do then
    begin rescue ensure retry raise return yield break next redo case when
    and or not self super nil true false defined? alias undef require
    require_relative include extend attr_accessor attr_reader attr_writer
    private public protected lambda proc new
  `),
  types: set(`
    Integer Float String Symbol Array Hash Range Struct Time Class Module
    Numeric Comparable Enumerable Exception StandardError
  `),
  builtins: set(`
    puts print p pp gets loop each each_with_index each_with_object map
    collect select filter reject reduce inject sum min max sort sort_by
    length size count first last push pop shift unshift join split strip
    chomp upcase downcase capitalize to_s to_i to_f to_a to_sym include?
    empty? nil? any? all? none? zip flatten compact uniq reverse freeze
  `),
};

const PHP: ModeSpec = {
  lineComment: ['//', '#'],
  blockComment: ['/*', '*/'],
  strings: [{ open: '"', multiline: true }, { open: "'", multiline: true }],
  keywords: set(`
    function return if elseif else endif while endwhile for endfor foreach
    endforeach as do switch case default break continue class interface trait
    extends implements abstract final public private protected static const
    new clone instanceof namespace use require require_once include include_once
    try catch finally throw global echo print var declare enum fn match yield
    and or xor not isset unset empty list array true false null
  `),
  types: set(`
    int integer float double string bool boolean array object callable iterable
    mixed void never self parent static Closure Generator Exception ArrayObject
  `),
  builtins: set(`
    echo print printf sprintf var_dump print_r count strlen strtolower
    strtoupper ucfirst ucwords trim ltrim rtrim explode implode str_replace
    substr strpos str_repeat str_split number_format json_encode json_decode
    array_map array_filter array_reduce array_keys array_values array_merge
    array_push array_pop in_array array_search sort usort ksort asort range
    abs round floor ceil sqrt pow max min rand intval floatval strval isset
  `),
};

const MATLAB: ModeSpec = {
  lineComment: ['%', '#'],
  blockComment: ['%{', '%}'],
  strings: [{ open: '"' }, { open: "'" }],
  keywords: set(`
    function endfunction return if elseif else endif end while endwhile for
    endfor do until switch case otherwise endswitch break continue try catch
    end_try_catch unwind_protect global persistent nargin nargout varargin
    varargout classdef properties methods events enumeration parfor spmd
  `),
  types: set(`
    double single int8 int16 int32 int64 uint8 uint16 uint32 uint64 logical
    char cell struct string function_handle
  `),
  builtins: set(`
    disp printf fprintf sprintf error warning size length numel ndims zeros
    ones eye rand randn linspace logspace reshape repmat cat horzcat vertcat
    sum prod cumsum mean median mode std var min max sort find any all
    abs sqrt exp log log2 log10 sin cos tan floor ceil round fix mod rem
    isempty isnumeric ischar iscell isstruct isfield fieldnames num2str str2num
    strcmp strcat strsplit strjoin plot figure hold xlabel ylabel title legend
  `),
};

const PLAIN: ModeSpec = {
  lineComment: [], strings: [],
  keywords: new Set(), types: new Set(), builtins: new Set(),
};

const MODES: Record<Mode, ModeSpec> = {
  python: PYTHON, clike: CLIKE, javascript: JAVASCRIPT, sql: SQL,
  shell: SHELL, r: R, ruby: RUBY, php: PHP, matlab: MATLAB, plain: PLAIN,
};

/** Map a backend `editor_mode` string onto a known profile. */
export function resolveMode(mode: string | undefined | null): Mode {
  return mode && mode in MODES ? (mode as Mode) : 'plain';
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

const OPERATOR_CHARS = '+-*/%=<>!&|^~?:@';
const PUNCT_CHARS = '(){}[];,.';

/** Walk to the end of a string literal. Unterminated literals stop at EOL/EOF. */
function scanString(code: string, start: number, rule: StringRule): number {
  const open = rule.open;
  const close = rule.close ?? open;
  const escapes = rule.escape !== false;
  const multiline = rule.multiline === true;
  const n = code.length;
  let i = start + open.length;

  while (i < n) {
    const ch = code[i];
    if (escapes && ch === '\\') { i += 2; continue; }
    if (!multiline && ch === '\n') return i;
    if (code.startsWith(close, i)) return i + close.length;
    i++;
  }
  return n;
}

interface Token { t: TokenType; v: string }

export function tokenize(code: string, mode: Mode): Token[] {
  const spec = MODES[mode];
  const out: Token[] = [];
  const n = code.length;

  // Consecutive uncoloured characters are merged into one run so a 1k-line
  // file produces hundreds of spans rather than tens of thousands.
  let plain = '';
  const flush = () => { if (plain) { out.push({ t: 'plain', v: plain }); plain = ''; } };
  const push = (t: TokenType, v: string) => { flush(); out.push({ t, v }); };

  // R identifiers legitimately contain dots (is.na, data.frame);
  // Ruby predicates and bang-methods end in ? or !.
  const identChar = mode === 'r' ? /[A-Za-z0-9_.]/ : /[A-Za-z0-9_$]/;
  const identStart = /[A-Za-z_$]/;
  const numberRe = /^(?:0[xXbBoO][0-9a-fA-F_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?|\.\d[\d_]*(?:[eE][+-]?\d+)?)[fFdDlLuU]*/;

  let i = 0;
  let atLineStart = true;

  while (i < n) {
    const ch = code[i];

    if (ch === '\n') { plain += ch; i++; atLineStart = true; continue; }
    if (ch === ' ' || ch === '\t' || ch === '\r') { plain += ch; i++; continue; }

    // C-family preprocessor directive — whole line
    if (spec.preproc && atLineStart && ch === '#') {
      let j = i;
      while (j < n && code[j] !== '\n') j++;
      push('preproc', code.slice(i, j));
      i = j; atLineStart = false; continue;
    }

    if (spec.blockComment) {
      const [open, close] = spec.blockComment;
      if (code.startsWith(open, i)) {
        const at = code.indexOf(close, i + open.length);
        const end = at === -1 ? n : at + close.length;
        push('comment', code.slice(i, end));
        i = end; atLineStart = false; continue;
      }
    }

    const linePrefix = spec.lineComment.find((p) => code.startsWith(p, i));
    if (linePrefix) {
      let j = i;
      while (j < n && code[j] !== '\n') j++;
      push('comment', code.slice(i, j));
      i = j; continue;
    }

    // Openers are listed longest-first per mode, so ''' wins over '
    const strRule = spec.strings.find((r) => code.startsWith(r.open, i));
    if (strRule) {
      const end = scanString(code, i, strRule);
      push('string', code.slice(i, end));
      i = end; atLineStart = false; continue;
    }

    // $VAR / ${VAR} in shell and PHP read as identifiers, not operators
    if ((mode === 'shell' || mode === 'php') && ch === '$') {
      let j = i + 1;
      if (code[j] === '{') {
        const at = code.indexOf('}', j);
        j = at === -1 ? n : at + 1;
      } else {
        while (j < n && /[A-Za-z0-9_?#@*!]/.test(code[j])) j++;
      }
      push('builtin', code.slice(i, j));
      i = j; atLineStart = false; continue;
    }

    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(code[i + 1] ?? ''))) {
      const m = numberRe.exec(code.slice(i, i + 40));
      const value = m ? m[0] : ch;
      push('number', value);
      i += value.length; atLineStart = false; continue;
    }

    if (identStart.test(ch)) {
      let j = i + 1;
      while (j < n && identChar.test(code[j])) j++;
      if (mode === 'ruby' && (code[j] === '?' || code[j] === '!')) j++;
      const word = code.slice(i, j);
      const key = spec.caseInsensitive ? word.toLowerCase() : word;
      const type: TokenType =
        spec.keywords.has(key) ? 'keyword'
        : spec.types.has(key) ? 'type'
        : spec.builtins.has(key) ? 'builtin'
        : 'plain';
      if (type === 'plain') plain += word; else push(type, word);
      i = j; atLineStart = false; continue;
    }

    if (OPERATOR_CHARS.includes(ch)) {
      let j = i;
      while (j < n && OPERATOR_CHARS.includes(code[j])) j++;
      push('operator', code.slice(i, j));
      i = j; atLineStart = false; continue;
    }

    if (PUNCT_CHARS.includes(ch)) {
      push('punct', ch);
      i++; atLineStart = false; continue;
    }

    plain += ch; i++; atLineStart = false;
  }

  flush();
  return out;
}

// Beyond this the per-keystroke retokenise starts to be felt; the editor
// degrades to plain text rather than to a laggy one.
const MAX_HIGHLIGHT_CHARS = 40_000;

/** Render `code` as highlighted HTML for the editor's backdrop layer. */
export function highlight(code: string, mode: Mode): string {
  if (!code) return '';
  if (code.length > MAX_HIGHLIGHT_CHARS) return escapeHtml(code);

  let html = '';
  for (const { t, v } of tokenize(code, mode)) {
    html += t === 'plain' ? escapeHtml(v) : `<span class="tok-${t}">${escapeHtml(v)}</span>`;
  }
  return html;
}

