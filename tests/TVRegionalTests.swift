import Foundation
@main struct TVRegionalTests {
    static func main() {
        for value in ["zh-TW", "zh-Hant-TW", "zh_Hant_TW"] { precondition(TVStrings.detect([value]) == "zh-TW") }
        for value in ["zh-HK", "zh-Hant", "zh-MO"] { precondition(TVStrings.detect([value]) == "zh") }
        precondition(TVStrings.detect(["zh-CN"]) == "zh-Hans")
        precondition(TVStrings.codes.contains("zh-TW"))
        for code in ["en-US", "en-GB", "pt-BR", "pt-PT", "es-ES", "es-MX"] {
            precondition(TVStrings.codes.contains(code))
            precondition(TVStrings.detect([code]) == code)
            precondition(TVStrings.detect([code.replacingOccurrences(of: "-", with: "_")]) == code)
        }
        precondition(TVStrings.detect(["es-AR"]) == "es")
        print("27 regional native locale checks passed")
    }
}
