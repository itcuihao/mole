package profile

import "testing"

func TestValidateEnvVarNameAllowsLowercase(t *testing.T) {
	if err := ValidateEnvVarName("http_proxy"); err != nil {
		t.Fatalf("ValidateEnvVarName(http_proxy) returned error: %v", err)
	}
}

func TestValidateEnvVarNameRejectsHyphen(t *testing.T) {
	if err := ValidateEnvVarName("bad-name"); err == nil {
		t.Fatal("ValidateEnvVarName(bad-name) returned nil error")
	}
}

func TestNormalizeProfileEnvTrimsWhitespace(t *testing.T) {
	envVars, secretKeys, secrets, err := NormalizeProfileEnv(
		map[string]string{
			" OPENAI_API_KEY ": "value",
		},
		[]string{" http_proxy "},
		map[string]string{
			" http_proxy ": "http://localhost:7890",
		},
	)
	if err != nil {
		t.Fatalf("NormalizeProfileEnv() returned error: %v", err)
	}

	if got := envVars["OPENAI_API_KEY"]; got != "value" {
		t.Fatalf("envVars[OPENAI_API_KEY] = %q, want %q", got, "value")
	}
	if _, ok := envVars[" OPENAI_API_KEY "]; ok {
		t.Fatal("expected whitespace-padded env key to be normalized")
	}

	if len(secretKeys) != 1 || secretKeys[0] != "http_proxy" {
		t.Fatalf("secretKeys = %#v, want []string{\"http_proxy\"}", secretKeys)
	}

	if got := secrets["http_proxy"]; got != "http://localhost:7890" {
		t.Fatalf("secrets[http_proxy] = %q, want %q", got, "http://localhost:7890")
	}
}

func TestNormalizeProfileEnvRejectsDuplicateTrimmedNames(t *testing.T) {
	_, _, _, err := NormalizeProfileEnv(
		map[string]string{
			"OPENAI_API_KEY": "value",
		},
		[]string{" OPENAI_API_KEY "},
		map[string]string{
			" OPENAI_API_KEY ": "secret",
		},
	)
	if err == nil {
		t.Fatal("NormalizeProfileEnv() returned nil error for duplicate trimmed names")
	}
}
