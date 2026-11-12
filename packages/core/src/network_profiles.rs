use crate::{config::NodeConfig, contracts::ErrorCode};

pub struct Profile {
    pub genesis: &'static str,
    pub activation: u32,
    pub halving_interval: u32,
    pub retarget_interval: Option<u32>,
}
impl Profile {
    pub fn from_config(config: &NodeConfig) -> Result<Self, ErrorCode> {
        let (genesis, activation, halving_interval, retarget_interval) =
            match config.network.as_str() {
                "main" => (
                    "000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f",
                    961640,
                    210000,
                    Some(2016),
                ),
                "testnet4" => (
                    "00000000da84f2bafbbc53dee25a72ae507ff4914b867c565be350b0da8bf043",
                    150308,
                    210000,
                    Some(2016),
                ),
                "regtest" => (
                    "0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206",
                    config.activation_height.ok_or(ErrorCode::InvalidConfig)?,
                    150,
                    None,
                ),
                _ => return Err(ErrorCode::InvalidConfig),
            };
        Ok(Self {
            genesis,
            activation,
            halving_interval,
            retarget_interval,
        })
    }
}
