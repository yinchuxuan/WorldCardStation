pub fn worldbook() -> Vec<(&'static str, &'static str)> {
    macro_rules! script {
        ($name:literal) => {
            (
                concat!("lib/worldbook/", $name),
                include_str!(concat!(
                    "../../../libs/worldbook-library/lib/worldbook/",
                    $name
                )),
            )
        };
    }
    vec![
        script!("index.js"),
        script!("normalize.js"),
        script!("matcher.js"),
        script!("context.js"),
        script!("positions.js"),
        script!("decorators.js"),
        script!("macros.js"),
        script!("content.js"),
        script!("timing.js"),
        script!("groups.js"),
        script!("budget.js"),
        script!("resolver.js"),
        script!("examples.js"),
        script!("injector.js"),
        (
            "lib/worldbook/README.md",
            include_str!("../../../libs/worldbook-library/README.md"),
        ),
        (
            "lib/worldbook/SEMANTICS.md",
            include_str!("../../../libs/worldbook-library/SEMANTICS.md"),
        ),
    ]
}

pub fn fingerprint() -> String {
    use sha2::{Digest, Sha256};
    let mut digest = Sha256::new();
    for (path, content) in worldbook() {
        digest.update(path);
        digest.update([0]);
        digest.update(content);
    }
    crate::game_card_png::sha256_hex(&digest.finalize().into())
}
