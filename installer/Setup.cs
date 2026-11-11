using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

[assembly: AssemblyTitle("Nimbalyst RU Setup")]
[assembly: AssemblyDescription("Unofficial Russian translation installer for Nimbalyst")]
[assembly: AssemblyVersion("1.2.0.0")]

internal static class Program {
    internal static string Package;
    internal static string Reports;
    [STAThread] static int Main(string[] args) {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        try {
            bool test = args.Length == 2 && args[0] == "--self-test";
            string root = test ? Path.GetFullPath(args[1]) : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Nimbalyst-RU", "launcher");
            Directory.CreateDirectory(root);
            Package = Path.Combine(root, "session-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(Package);
            using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))
            using (var archive = new ZipArchive(stream, ZipArchiveMode.Read)) {
                foreach (var entry in archive.Entries) {
                    string target = Path.GetFullPath(Path.Combine(Package, entry.FullName));
                    if (!target.StartsWith(Package + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new IOException("Недопустимый путь в пакете");
                    if (entry.FullName.EndsWith("/")) { Directory.CreateDirectory(target); continue; }
                    Directory.CreateDirectory(Path.GetDirectoryName(target));
                    entry.ExtractToFile(target, false);
                }
            }
            if (test) {
                var p = new ProcessStartInfo(Path.Combine(Package, "runtime", "node.exe"), "--test tests/mod.test.cjs");
                p.WorkingDirectory = Package; p.UseShellExecute = false; p.CreateNoWindow = true;
                p.RedirectStandardOutput = true; p.RedirectStandardError = true; p.StandardOutputEncoding = Encoding.UTF8; p.StandardErrorEncoding = Encoding.UTF8;
                using (var child = Process.Start(p)) {
                    Task<string> stdout = child.StandardOutput.ReadToEndAsync(), stderr = child.StandardError.ReadToEndAsync();
                    child.WaitForExit();
                    File.WriteAllText(Path.Combine(root, "self-test.log"), stdout.Result + stderr.Result, Encoding.UTF8);
                    return child.ExitCode;
                }
            }
            Reports = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Nimbalyst-RU", "reports", DateTime.Now.ToString("yyyyMMdd-HHmmss") + "-" + Guid.NewGuid().ToString("N").Substring(0, 6));
            Application.Run(new SetupForm());
            return 0;
        } catch (Exception e) {
            if (args.Length == 2 && args[0] == "--self-test") File.WriteAllText(Path.Combine(Path.GetFullPath(args[1]), "self-test-error.log"), e.ToString());
            else MessageBox.Show(e.Message, "Nimbalyst RU — ошибка", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        } finally {
            // Only this invocation's unique extraction directory, never backups or app data.
            if (Package != null && Directory.Exists(Package)) { try { Directory.Delete(Package, true); } catch { } }
        }
    }
}

internal sealed class SetupForm : Form {
    TextBox appDir = new TextBox(), log = new TextBox();
    CheckBox untested = new CheckBox();
    FlowLayoutPanel actions = new FlowLayoutPanel();
    Label status = new Label();
    bool busy;
    public SetupForm() {
        Text = "Nimbalyst RU — установка русификатора";
        Size = new Size(820, 650); MinimumSize = new Size(760, 580);
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 10); AutoScaleMode = AutoScaleMode.Dpi;
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(20), ColumnCount = 1, RowCount = 8 };
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 64));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 52));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 35));
        layout.Controls.Add(new Label { Text = "Nimbalyst на русском", Font = new Font("Segoe UI", 19, FontStyle.Bold), Dock = DockStyle.Fill });
        layout.Controls.Add(new Label { Text = "Неофициальный русификатор 1.2.0 · Windows x64 · проверен с Nimbalyst 0.83.0\nПолностью закройте Nimbalyst перед установкой или удалением.\nNode.js включён в пакет. Исходные файлы сохраняются для отката.", Dock = DockStyle.Fill });
        var paths = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3 };
        paths.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 165)); paths.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100)); paths.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 100));
        paths.Controls.Add(new Label { Text = "Папка приложения:", Dock = DockStyle.Fill });
        appDir.Dock = DockStyle.Fill; paths.Controls.Add(appDir);
        var browse = new Button { Text = "Выбрать…", Dock = DockStyle.Fill };
        browse.Click += delegate { using (var dialog = new FolderBrowserDialog { Description = "Выберите папку с Nimbalyst.exe" }) { if (dialog.ShowDialog() == DialogResult.OK) appDir.Text = dialog.SelectedPath; } };
        paths.Controls.Add(browse); layout.Controls.Add(paths);
        untested.Text = "Пробная установка на новой версии (проверки совместимости сохраняются)"; untested.Dock = DockStyle.Fill; layout.Controls.Add(untested);
        actions.Dock = DockStyle.Fill;
        AddAction("Установить", "install"); AddAction("Удалить перевод", "uninstall"); AddAction("Диагностика", "diagnose"); AddAction("Восстановить", "recover");
        layout.Controls.Add(actions);
        log.Multiline = true; log.ReadOnly = true; log.ScrollBars = ScrollBars.Both; log.WordWrap = false; log.Dock = DockStyle.Fill; log.Font = new Font("Consolas", 9);
        log.Text = "Пустая папка приложения — автоматический поиск.\r\nПосле обновления Nimbalyst запустите этот установщик ещё раз.\r\n«Восстановить» отменяет прерванную установку из проверенной резервной копии.";
        layout.Controls.Add(log); status.Text = "Готово к работе."; status.Dock = DockStyle.Fill; layout.Controls.Add(status);
        var links = new FlowLayoutPanel { Dock = DockStyle.Fill };
        var reports = new Button { Text = "Открыть отчёты", AutoSize = true }; reports.Click += delegate { Directory.CreateDirectory(Program.Reports); Process.Start("explorer.exe", Quote(Program.Reports)); };
        var docs = new LinkLabel { Text = "Инструкция и обновления на GitHub", AutoSize = true, Margin = new Padding(12, 8, 0, 0) }; docs.LinkClicked += delegate { Process.Start(new ProcessStartInfo("https://github.com/l1ha4/nimbalyst-ru") { UseShellExecute = true }); };
        links.Controls.Add(reports); links.Controls.Add(docs); layout.Controls.Add(links); Controls.Add(layout);
        FormClosing += delegate(object sender, FormClosingEventArgs e) { if (busy) { e.Cancel = true; status.Text = "Дождитесь завершения операции перед закрытием."; } };
    }
    static string Quote(string text) { if (text.Contains("\"") || text.Contains("\r") || text.Contains("\n")) throw new ArgumentException("Недопустимый символ в пути"); return "\"" + text.TrimEnd('\\') + "\""; }
    void AddAction(string title, string command) {
        var button = new Button { Text = title, AutoSize = true, Height = 34, Margin = new Padding(0, 4, 10, 4) };
        button.Click += async delegate { await Run(command); }; actions.Controls.Add(button);
    }
    async Task Run(string action) {
        if (busy) return;
        if (action == "install" && untested.Checked && MessageBox.Show("Эта версия приложения может быть несовместима. Продолжить пробную установку после автоматических проверок?", "Новая версия Nimbalyst", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        busy = true; actions.Enabled = false; appDir.Enabled = false; untested.Enabled = false;
        status.Text = "Выполняется операция. Если Windows запросит права администратора, подтвердите запрос.";
        log.Clear();
        try {
            string arguments = "-NoProfile -ExecutionPolicy Bypass -File " + Quote(Path.Combine(Program.Package, "run.ps1")) + " -Action " + action;
            if (appDir.Text.Trim().Length > 0) arguments += " -AppDir " + Quote(appDir.Text.Trim());
            if (action == "install" && untested.Checked) arguments += " -AllowUntested";
            var info = new ProcessStartInfo(Path.Combine(Environment.SystemDirectory, "WindowsPowerShell", "v1.0", "powershell.exe"), arguments);
            info.UseShellExecute = false; info.CreateNoWindow = true; info.WorkingDirectory = Program.Package;
            info.RedirectStandardOutput = true; info.RedirectStandardError = true; info.StandardOutputEncoding = Encoding.UTF8; info.StandardErrorEncoding = Encoding.UTF8;
            using (var process = Process.Start(info)) {
                Task<string> output = process.StandardOutput.ReadToEndAsync(), errors = process.StandardError.ReadToEndAsync();
                await Task.Run(() => process.WaitForExit());
                log.Text = ((await output) + (await errors)).Replace("\r\n", "\n").Replace("\n", Environment.NewLine);
                status.Text = process.ExitCode == 0 ? (action == "install" ? "Готово. Можно открыть Nimbalyst." : "Операция завершена.") : "Операция не выполнена. Подробности приведены выше.";
            }
        } catch (Exception e) { log.Text = e.Message; status.Text = "Ошибка запуска."; }
        finally {
            try {
                string source = Path.Combine(Program.Package, "reports"); Directory.CreateDirectory(Program.Reports);
                if (Directory.Exists(source)) foreach (string file in Directory.GetFiles(source)) File.Copy(file, Path.Combine(Program.Reports, Path.GetFileName(file)), true);
                log.AppendText(Environment.NewLine + "Сохранённые отчёты: " + Program.Reports);
            } catch (Exception e) { log.AppendText("\r\nНе удалось сохранить отчёт: " + e.Message); }
            busy = false; actions.Enabled = true; appDir.Enabled = true; untested.Enabled = true;
        }
    }
}
