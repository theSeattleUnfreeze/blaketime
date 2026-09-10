use base64::{Engine, engine::general_purpose::STANDARD};
use minisign_verify::{PublicKey, Signature};

fn decoded(value: &str) -> Result<String, Box<dyn std::error::Error>> {
    String::from_utf8(
        STANDARD
            .decode(value.trim())
            .map_err(|_| "invalid signing metadata")?,
    )
    .map_err(|_| "invalid signing metadata".into())
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.len() != 2 {
        return Err("expected artifact and signature paths".into());
    }
    if std::fs::metadata(&args[0])?.len() > 512 * 1024 * 1024
        || std::fs::metadata(&args[1])?.len() > 65536
    {
        return Err("artifact exceeds verification limit".into());
    }
    let key = PublicKey::decode(&decoded(&std::env::var("BLAKETIME_UPDATE_KEY")?)?)
        .map_err(|_| "invalid public key")?;
    let signature = Signature::decode(&decoded(&std::fs::read_to_string(&args[1])?)?)
        .map_err(|_| "invalid signature")?;
    key.verify(&std::fs::read(&args[0])?, &signature, true)
        .map_err(|_| "signature verification failed")?;
    println!("signature verified");
    Ok(())
}
