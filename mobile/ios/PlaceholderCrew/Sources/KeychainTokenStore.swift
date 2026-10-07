import CrewCore
import Foundation
import Security

/// Access/refresh tokens live in the Keychain, never in UserDefaults or URLs.
final class KeychainTokenStore: TokenStore, @unchecked Sendable {
    private let service = "ai.placeholder.crew.tokens"

    func load() -> Tokens? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                                    kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return try? JSON.decoder.decode(Tokens.self, from: data)
    }

    func save(_ tokens: Tokens?) {
        let base: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service]
        SecItemDelete(base as CFDictionary)
        guard let tokens, let data = try? JSON.encoder.encode(tokens) else { return }
        var add = base
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }
}
