package profile

import (
	"mole/internal/config"

	"github.com/keybase/go-keychain"
)

func keychainAccount(profileID, key string) string {
	return profileID + ":" + key
}

// SetSecret stores a secret value in macOS Keychain.
func SetSecret(profileID, key, value string) error {
	account := keychainAccount(profileID, key)

	// Try to delete existing item first (update = delete + add)
	_ = DeleteSecret(profileID, key)

	item := keychain.NewItem()
	item.SetSecClass(keychain.SecClassGenericPassword)
	item.SetService(config.KeychainService)
	item.SetAccount(account)
	item.SetData([]byte(value))
	item.SetSynchronizable(keychain.SynchronizableNo)
	item.SetAccessible(keychain.AccessibleWhenUnlocked)

	return keychain.AddItem(item)
}

// GetSecret retrieves a secret value from macOS Keychain.
func GetSecret(profileID, key string) (string, error) {
	account := keychainAccount(profileID, key)

	query := keychain.NewItem()
	query.SetSecClass(keychain.SecClassGenericPassword)
	query.SetService(config.KeychainService)
	query.SetAccount(account)
	query.SetMatchLimit(keychain.MatchLimitOne)
	query.SetReturnData(true)

	results, err := keychain.QueryItem(query)
	if err != nil {
		return "", err
	}
	if len(results) == 0 {
		return "", keychain.ErrorItemNotFound
	}
	return string(results[0].Data), nil
}

// DeleteSecret removes a secret from macOS Keychain.
func DeleteSecret(profileID, key string) error {
	account := keychainAccount(profileID, key)

	item := keychain.NewItem()
	item.SetSecClass(keychain.SecClassGenericPassword)
	item.SetService(config.KeychainService)
	item.SetAccount(account)

	return keychain.DeleteItem(item)
}

// DeleteAllSecrets removes all secrets for a profile from macOS Keychain.
func DeleteAllSecrets(profileID string, keys []string) {
	for _, key := range keys {
		_ = DeleteSecret(profileID, key)
	}
}
