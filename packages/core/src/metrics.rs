use crate::contracts::Block;
use rust_decimal::{Decimal, prelude::ToPrimitive};
use serde_json::Value;
use std::str::FromStr;

pub fn epoch(height: u32, interval: u32) -> (f64, u32, u32) {
    let remaining = interval - height % interval;
    (
        f64::from(height % interval) / f64::from(interval),
        height.saturating_add(remaining),
        remaining,
    )
}

pub fn fee_rate(value: &Value) -> Option<f64> {
    let text = value
        .as_str()
        .map(str::to_owned)
        .unwrap_or_else(|| value.to_string());
    let decimal = Decimal::from_str(&text)
        .or_else(|_| Decimal::from_scientific(&text))
        .ok()?;
    if decimal.is_sign_negative() {
        return None;
    }
    decimal
        .checked_mul(Decimal::from(100000))?
        .to_f64()
        .filter(|n| n.is_finite())
}

pub fn average_interval(blocks: &[Block]) -> (Option<f64>, u32) {
    let Some(first) = blocks.first() else {
        return (None, 0);
    };
    let same: Vec<_> = blocks
        .iter()
        .take_while(|b| b.header_version == first.header_version)
        .collect();
    let count = same.len().saturating_sub(1) as u32;
    let elapsed = first.time - same.last().unwrap().time;
    if count == 0 || elapsed <= 0 {
        return (None, count);
    }
    (Some(elapsed as f64 / f64::from(count)), count)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn epoch_boundaries() {
        assert_eq!(epoch(209999, 210000).1, 210000);
        assert_eq!(epoch(209999, 210000).2, 1);
        assert_eq!(epoch(210000, 210000), (0.0, 420000, 210000));
        assert_eq!(epoch(149, 150).2, 1);
        assert_eq!(epoch(2015, 2016).2, 1);
    }
    #[test]
    fn converts_rates_without_decimal_accumulation() {
        assert_eq!(fee_rate(&serde_json::json!(0.00001)), Some(1.0));
        assert_eq!(fee_rate(&serde_json::json!("1e-8")), Some(0.001));
        assert_eq!(fee_rate(&serde_json::json!(-1)), None);
        assert_eq!(fee_rate(&Value::Null), None);
    }
    #[test]
    fn never_averages_across_pow_boundary() {
        let block = |time, header_version| Block {
            hash: String::new(),
            height: 0,
            time,
            header_version,
            difficulty: 1.0,
        };
        let blocks = vec![block(1200, 2), block(600, 2), block(0, 0)];
        assert_eq!(average_interval(&blocks), (Some(600.0), 1));
        assert_eq!(average_interval(&blocks[..1]), (None, 0));
        assert_eq!(average_interval(&[block(1, 2), block(2, 2)]), (None, 1));
    }
}
