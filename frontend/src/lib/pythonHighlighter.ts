export type SyntaxTokenKind =
  | "builtin"
  | "comment"
  | "decorator"
  | "keyword"
  | "number"
  | "operator"
  | "plain"
  | "string";

export type SyntaxToken = {
  kind: SyntaxTokenKind;
  text: string;
};

const keywords = new Set([
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
]);

const builtins = new Set([
  "abs",
  "all",
  "any",
  "bool",
  "dict",
  "enumerate",
  "float",
  "int",
  "len",
  "list",
  "map",
  "max",
  "min",
  "open",
  "print",
  "range",
  "round",
  "set",
  "str",
  "sum",
  "tuple",
  "zip",
]);

const numberPattern = /^(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;
const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*/;
const operatorPattern = /^(?:==|!=|<=|>=|:=|\*\*|\/\/|->|[+\-*/%=<>()[\]{}:.,])/;

export function tokenizePythonLine(line: string): SyntaxToken[] {
  const tokens: SyntaxToken[] = [];
  let index = 0;

  while (index < line.length) {
    const rest = line.slice(index);

    if (rest.startsWith("#")) {
      pushToken(tokens, "comment", rest);
      break;
    }

    if (rest.startsWith("@")) {
      const match = rest.match(/^@[A-Za-z_][A-Za-z0-9_.]*/);
      if (match) {
        pushToken(tokens, "decorator", match[0]);
        index += match[0].length;
        continue;
      }
    }

    const stringToken = readString(rest);
    if (stringToken) {
      pushToken(tokens, "string", stringToken);
      index += stringToken.length;
      continue;
    }

    const numberMatch = rest.match(numberPattern);
    if (numberMatch) {
      pushToken(tokens, "number", numberMatch[0]);
      index += numberMatch[0].length;
      continue;
    }

    const identifierMatch = rest.match(identifierPattern);
    if (identifierMatch) {
      const word = identifierMatch[0];
      pushToken(tokens, keywords.has(word) ? "keyword" : builtins.has(word) ? "builtin" : "plain", word);
      index += word.length;
      continue;
    }

    const operatorMatch = rest.match(operatorPattern);
    if (operatorMatch) {
      pushToken(tokens, "operator", operatorMatch[0]);
      index += operatorMatch[0].length;
      continue;
    }

    pushToken(tokens, "plain", rest[0]);
    index += 1;
  }

  return tokens.length > 0 ? tokens : [{ kind: "plain", text: "" }];
}

function readString(source: string) {
  const prefixMatch = source.match(/^(?:[rRuUbBfF]{0,2})("""|'''|"|')/);
  if (!prefixMatch) {
    return null;
  }

  const quote = prefixMatch[1];
  let index = prefixMatch[0].length;

  while (index < source.length) {
    if (source.startsWith(quote, index)) {
      return source.slice(0, index + quote.length);
    }

    if (source[index] === "\\" && quote.length === 1) {
      index += 2;
      continue;
    }

    index += 1;
  }

  return source;
}

function pushToken(tokens: SyntaxToken[], kind: SyntaxTokenKind, text: string) {
  const previous = tokens[tokens.length - 1];
  if (previous?.kind === kind) {
    previous.text += text;
    return;
  }

  tokens.push({ kind, text });
}
