use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Template-authored rule for when quotations render as block vs inline in the editor
/// and in generated Typst (`#quote(block: …)`).
///
/// Serialized as either a word threshold (e.g. `40`), or the strings `"block"` / `"inline"`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(untagged)]
pub enum QuotePolicySpec {
    ThresholdWords(u32),
    Mode(String),
}

impl Default for QuotePolicySpec {
    fn default() -> Self {
        Self::ThresholdWords(40)
    }
}

impl QuotePolicySpec {
    pub fn should_emit_as_block(&self, word_count: u32) -> bool {
        match self {
            Self::Mode(mode) if mode == "inline" => false,
            Self::Mode(mode) if mode == "block" => word_count > 0,
            Self::Mode(_) => false,
            Self::ThresholdWords(threshold) => word_count >= *threshold,
        }
    }

    /// Value passed to Typst `quote-word-trigger` so preview matches editor policy.
    pub fn typst_quote_word_trigger(&self) -> u32 {
        match self {
            Self::Mode(mode) if mode == "inline" => u32::MAX,
            Self::Mode(mode) if mode == "block" => 1,
            Self::Mode(_) => 40,
            Self::ThresholdWords(threshold) => *threshold,
        }
    }
}

pub fn count_words(text: &str) -> u32 {
    text.split_whitespace().filter(|word| !word.is_empty()).count() as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn threshold_policy_matches_apa_40_words() {
        let policy = QuotePolicySpec::ThresholdWords(40);
        assert!(!policy.should_emit_as_block(39));
        assert!(policy.should_emit_as_block(40));
    }

    #[test]
    fn block_mode_requires_at_least_one_word() {
        let policy = QuotePolicySpec::Mode("block".to_string());
        assert!(!policy.should_emit_as_block(0));
        assert!(policy.should_emit_as_block(1));
    }

    #[test]
    fn inline_mode_never_blocks() {
        let policy = QuotePolicySpec::Mode("inline".to_string());
        assert!(!policy.should_emit_as_block(100));
    }

    #[test]
    fn typst_trigger_aligns_with_policy() {
        assert_eq!(
            QuotePolicySpec::ThresholdWords(40).typst_quote_word_trigger(),
            40
        );
        assert_eq!(
            QuotePolicySpec::Mode("block".to_string()).typst_quote_word_trigger(),
            1
        );
        assert_eq!(
            QuotePolicySpec::Mode("inline".to_string()).typst_quote_word_trigger(),
            u32::MAX
        );
    }
}
