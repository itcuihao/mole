cask "mole" do
  arch arm: "arm64", intel: "amd64"

  version "0.1.3"
  sha256 :no_check

  url "https://github.com/itcuihao/mole/releases/download/v#{version}/Mole-v#{version}-macos-#{arch}.zip"
  name "Mole"
  desc "Terminal workspace manager for profiles, hosts, and commands"
  homepage "https://github.com/itcuihao/mole"

  depends_on formula: "tmux"

  app "Mole.app"

  zap trash: [
    "~/.config/mole",
  ]
end
