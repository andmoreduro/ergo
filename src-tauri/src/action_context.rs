use std::collections::{HashMap, HashSet};

use crate::action_types::ActionContextSnapshot;

#[derive(Debug, Clone)]
pub(crate) struct ActiveContext {
    pub(crate) names: HashSet<String>,
    pub(crate) attributes: HashMap<String, String>,
}

impl ActiveContext {
    pub(crate) fn from_snapshot(snapshot: &ActionContextSnapshot) -> Self {
        let nodes_by_id: HashMap<_, _> = snapshot
            .nodes
            .iter()
            .map(|node| (node.id.as_str(), node))
            .collect();
        let mut chain = Vec::new();
        let mut current = snapshot
            .focused_context_id
            .as_deref()
            .or_else(|| snapshot.nodes.first().map(|node| node.id.as_str()));

        while let Some(id) = current {
            if let Some(node) = nodes_by_id.get(id) {
                chain.push(*node);
                current = node.parent_id.as_deref();
            } else {
                break;
            }
        }

        chain.reverse();

        let mut names = HashSet::new();
        let mut attributes = HashMap::new();

        for node in chain {
            for name in &node.contexts {
                names.insert(name.clone());
            }
            for (key, value) in &node.attributes {
                attributes.insert(key.clone(), value.clone());
            }
        }

        Self { names, attributes }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ContextExpression {
    Context(String),
    Equals(String, String),
    Not(Box<ContextExpression>),
    And(Box<ContextExpression>, Box<ContextExpression>),
    Or(Box<ContextExpression>, Box<ContextExpression>),
}

impl ContextExpression {
    pub(crate) fn evaluate(&self, context: &ActiveContext) -> bool {
        match self {
            ContextExpression::Context(name) => context.names.contains(name),
            ContextExpression::Equals(key, value) => context
                .attributes
                .get(key)
                .map(|actual| actual == value)
                .unwrap_or(false),
            ContextExpression::Not(inner) => !inner.evaluate(context),
            ContextExpression::And(left, right) => {
                left.evaluate(context) && right.evaluate(context)
            }
            ContextExpression::Or(left, right) => left.evaluate(context) || right.evaluate(context),
        }
    }

    /// Collects every context name and attribute key the expression references,
    /// regardless of negation. Used to validate catalog/keymap contexts against
    /// the glossary so a typo (`!tabelCell`) fails a test instead of silently
    /// never matching.
    #[cfg(test)]
    pub(crate) fn collect_referenced_names(&self, out: &mut HashSet<String>) {
        match self {
            ContextExpression::Context(name) => {
                out.insert(name.clone());
            }
            ContextExpression::Equals(key, _) => {
                out.insert(key.clone());
            }
            ContextExpression::Not(inner) => inner.collect_referenced_names(out),
            ContextExpression::And(left, right) | ContextExpression::Or(left, right) => {
                left.collect_referenced_names(out);
                right.collect_referenced_names(out);
            }
        }
    }

    pub(crate) fn specificity(&self) -> usize {
        match self {
            ContextExpression::Context(_) => 1,
            ContextExpression::Equals(_, _) => 2,
            ContextExpression::Not(inner) => inner.specificity(),
            ContextExpression::And(left, right) | ContextExpression::Or(left, right) => {
                left.specificity() + right.specificity()
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Token {
    Identifier(String),
    String(String),
    And,
    Or,
    Bang,
    Equals,
    LeftParen,
    RightParen,
}

pub(crate) fn parse_context_expression(value: &str) -> Result<ContextExpression, String> {
    let tokens = tokenize_context_expression(value)?;
    let mut parser = ContextParser {
        tokens,
        position: 0,
    };
    let expression = parser.parse_or()?;

    if parser.position != parser.tokens.len() {
        return Err("unexpected trailing tokens".to_string());
    }

    Ok(expression)
}

pub(crate) fn contexts_may_overlap(left: &str, right: &str) -> bool {
    if left == right {
        return true;
    }

    let left_positive = positive_context_names(left);
    let right_positive = positive_context_names(right);

    if left_positive.is_empty() || right_positive.is_empty() {
        return true;
    }

    !left_positive.is_disjoint(&right_positive)
}

fn positive_context_names(expression: &str) -> HashSet<String> {
    let mut names = HashSet::new();
    let mut negate_next = false;
    let mut previous = "";

    for token in tokenize_context_expression(expression).unwrap_or_default() {
        match token {
            Token::Bang => negate_next = true,
            Token::Identifier(value) => {
                if previous != "==" && !negate_next {
                    names.insert(value);
                }
                negate_next = false;
                previous = "id";
            }
            Token::Equals => previous = "==",
            _ => {
                negate_next = false;
                previous = "";
            }
        }
    }

    names
}

fn tokenize_context_expression(value: &str) -> Result<Vec<Token>, String> {
    let chars: Vec<char> = value.chars().collect();
    let mut index = 0;
    let mut tokens = Vec::new();

    while index < chars.len() {
        match chars[index] {
            character if character.is_whitespace() => index += 1,
            '&' if chars.get(index + 1) == Some(&'&') => {
                tokens.push(Token::And);
                index += 2;
            }
            '|' if chars.get(index + 1) == Some(&'|') => {
                tokens.push(Token::Or);
                index += 2;
            }
            '=' if chars.get(index + 1) == Some(&'=') => {
                tokens.push(Token::Equals);
                index += 2;
            }
            '!' => {
                tokens.push(Token::Bang);
                index += 1;
            }
            '(' => {
                tokens.push(Token::LeftParen);
                index += 1;
            }
            ')' => {
                tokens.push(Token::RightParen);
                index += 1;
            }
            '"' => {
                index += 1;
                let start = index;
                while index < chars.len() && chars[index] != '"' {
                    index += 1;
                }
                if index >= chars.len() {
                    return Err("unterminated string literal".to_string());
                }
                tokens.push(Token::String(chars[start..index].iter().collect()));
                index += 1;
            }
            character if is_identifier_start(character) => {
                let start = index;
                index += 1;
                while index < chars.len() && is_identifier_part(chars[index]) {
                    index += 1;
                }
                tokens.push(Token::Identifier(chars[start..index].iter().collect()));
            }
            character => {
                return Err(format!(
                    "unexpected context expression character: {character}"
                ))
            }
        }
    }

    if tokens.is_empty() {
        return Err("context expression cannot be empty".to_string());
    }

    Ok(tokens)
}

fn is_identifier_start(value: char) -> bool {
    value.is_alphabetic() || value == '_'
}

fn is_identifier_part(value: char) -> bool {
    value.is_alphanumeric() || matches!(value, '_' | '-' | '.' | ':')
}

struct ContextParser {
    tokens: Vec<Token>,
    position: usize,
}

impl ContextParser {
    fn parse_or(&mut self) -> Result<ContextExpression, String> {
        let mut expression = self.parse_and()?;

        while self.matches(&Token::Or) {
            let right = self.parse_and()?;
            expression = ContextExpression::Or(Box::new(expression), Box::new(right));
        }

        Ok(expression)
    }

    fn parse_and(&mut self) -> Result<ContextExpression, String> {
        let mut expression = self.parse_not()?;

        while self.matches(&Token::And) {
            let right = self.parse_not()?;
            expression = ContextExpression::And(Box::new(expression), Box::new(right));
        }

        Ok(expression)
    }

    fn parse_not(&mut self) -> Result<ContextExpression, String> {
        if self.matches(&Token::Bang) {
            return Ok(ContextExpression::Not(Box::new(self.parse_not()?)));
        }

        self.parse_primary()
    }

    fn parse_primary(&mut self) -> Result<ContextExpression, String> {
        if self.matches(&Token::LeftParen) {
            let expression = self.parse_or()?;
            if !self.matches(&Token::RightParen) {
                return Err("expected ')'".to_string());
            }
            return Ok(expression);
        }

        match self.advance() {
            Some(Token::Identifier(identifier)) => {
                if self.matches(&Token::Equals) {
                    let value = match self.advance() {
                        Some(Token::String(value)) | Some(Token::Identifier(value)) => value,
                        _ => return Err("expected value after '=='".to_string()),
                    };
                    Ok(ContextExpression::Equals(identifier, value))
                } else {
                    Ok(ContextExpression::Context(identifier))
                }
            }
            _ => Err("expected context name".to_string()),
        }
    }

    fn matches(&mut self, token: &Token) -> bool {
        if self.tokens.get(self.position) == Some(token) {
            self.position += 1;
            return true;
        }

        false
    }

    fn advance(&mut self) -> Option<Token> {
        let token = self.tokens.get(self.position).cloned();
        if token.is_some() {
            self.position += 1;
        }
        token
    }
}
