using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;

namespace FreeAgent.Launcher
{
    internal static class Program
    {
        private const int DefaultPort = 3000;
        private const string PlaceholderKey = "sk-or-v1-replace-me";
        private static Process serverProcess;

        private static int Main()
        {
            Console.OutputEncoding = Encoding.UTF8;
            Console.Title = "Free Agent";

            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string envPath = Path.Combine(appDir, ".env");

            Console.WriteLine("Free Agent 本地启动器");
            Console.WriteLine("工作目录：" + appDir);
            Console.WriteLine();

            if (!EnsureConfig(envPath))
            {
                return 1;
            }

            int port = GetConfiguredPort(envPath);
            string baseUrl = "http://localhost:" + port;

            if (IsHealthy(baseUrl))
            {
                Console.WriteLine("检测到服务已在运行：" + baseUrl);
                OpenBrowser(baseUrl);
                return 0;
            }

            string nodePath = ResolveNodePath(appDir);
            string serverPath = Path.Combine(appDir, "src", "server.js");

            if (!File.Exists(serverPath))
            {
                Console.WriteLine("未找到服务入口：" + serverPath);
                return 1;
            }

            serverProcess = StartNodeServer(nodePath, serverPath, appDir);
            AttachShutdownHandlers();

            if (!WaitForServer(baseUrl, TimeSpan.FromSeconds(12)))
            {
                Console.WriteLine("服务启动超时。请检查 .env 配置，或确认端口没有被其他程序占用。");
                StopServer();
                return 1;
            }

            Console.WriteLine("服务已启动：" + baseUrl);
            Console.WriteLine("关闭这个窗口或按 Ctrl+C 可以停止本地服务。");
            OpenBrowser(baseUrl);

            serverProcess.WaitForExit();
            return serverProcess.ExitCode;
        }

        private static bool EnsureConfig(string envPath)
        {
            if (!File.Exists(envPath))
            {
                WriteDefaultEnv(envPath, PlaceholderKey);
            }

            Dictionary<string, string> env = ReadEnv(envPath);
            string key = env.ContainsKey("OPENROUTER_API_KEY") ? env["OPENROUTER_API_KEY"].Trim() : "";

            if (IsUsableOpenRouterKey(key))
            {
                EnsureRequiredDefaults(envPath);
                return true;
            }

            Console.WriteLine("首次运行需要填写 OpenRouter Key。");
            Console.WriteLine("这个 key 只会写入当前目录的 .env，不会写进 exe。");
            Console.Write("请粘贴 OpenRouter Key 后回车；直接回车会打开配置文件并退出：");
            string input = (Console.ReadLine() ?? "").Trim();

            if (!IsUsableOpenRouterKey(input))
            {
                Console.WriteLine();
                Console.WriteLine(".env 已创建，你可以稍后把 OPENROUTER_API_KEY 改成自己的 key。");
                OpenTextEditor(envPath);
                return false;
            }

            SetEnvValue(envPath, "OPENROUTER_API_KEY", input);
            EnsureRequiredDefaults(envPath);
            Console.WriteLine("配置已保存。");
            Console.WriteLine();
            return true;
        }

        private static bool IsUsableOpenRouterKey(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return false;
            if (string.Equals(value, PlaceholderKey, StringComparison.OrdinalIgnoreCase)) return false;
            if (value.IndexOf("replace", StringComparison.OrdinalIgnoreCase) >= 0) return false;
            return value.StartsWith("sk-or-", StringComparison.OrdinalIgnoreCase);
        }

        private static void WriteDefaultEnv(string envPath, string apiKey)
        {
            string[] lines =
            {
                "# Free Agent 本地配置。不要把这个文件发给别人。",
                "OPENROUTER_API_KEY=" + apiKey,
                "RELAY_API_KEY=local-dev-token",
                "ALLOWED_MODELS=openrouter/free,qwen/qwen3-coder:free,baidu/cobuddy:free,openrouter/owl-alpha,nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free,poolside/laguna-m.1:free,poolside/laguna-xs.2:free",
                "FALLBACK_MODELS=qwen/qwen3-coder:free,openrouter/free",
                "PORT=3000",
                "OPENROUTER_SITE_URL=http://localhost:3000",
                "OPENROUTER_APP_TITLE=Free Agent",
                "MAX_BODY_BYTES=1048576",
                ""
            };

            File.WriteAllLines(envPath, lines, Encoding.UTF8);
        }

        private static void EnsureRequiredDefaults(string envPath)
        {
            Dictionary<string, string> env = ReadEnv(envPath);
            if (!env.ContainsKey("RELAY_API_KEY")) SetEnvValue(envPath, "RELAY_API_KEY", "local-dev-token");
            if (!env.ContainsKey("ALLOWED_MODELS")) SetEnvValue(envPath, "ALLOWED_MODELS", "openrouter/free,qwen/qwen3-coder:free,baidu/cobuddy:free,openrouter/owl-alpha,nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free,poolside/laguna-m.1:free,poolside/laguna-xs.2:free");
            if (!env.ContainsKey("FALLBACK_MODELS")) SetEnvValue(envPath, "FALLBACK_MODELS", "qwen/qwen3-coder:free,openrouter/free");
            if (!env.ContainsKey("PORT")) SetEnvValue(envPath, "PORT", DefaultPort.ToString());
            if (!env.ContainsKey("OPENROUTER_SITE_URL")) SetEnvValue(envPath, "OPENROUTER_SITE_URL", "http://localhost:3000");
            if (!env.ContainsKey("OPENROUTER_APP_TITLE")) SetEnvValue(envPath, "OPENROUTER_APP_TITLE", "Free Agent");
            if (!env.ContainsKey("MAX_BODY_BYTES")) SetEnvValue(envPath, "MAX_BODY_BYTES", "1048576");
        }

        private static Dictionary<string, string> ReadEnv(string envPath)
        {
            Dictionary<string, string> env = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (!File.Exists(envPath)) return env;

            string[] lines = File.ReadAllLines(envPath, Encoding.UTF8);
            foreach (string rawLine in lines)
            {
                string line = rawLine.Trim();
                if (line.Length == 0 || line.StartsWith("#")) continue;

                int index = line.IndexOf('=');
                if (index <= 0) continue;

                string key = line.Substring(0, index).Trim();
                string value = line.Substring(index + 1).Trim().Trim('"', '\'');
                env[key] = value;
            }

            return env;
        }

        private static void SetEnvValue(string envPath, string key, string value)
        {
            List<string> lines = File.Exists(envPath)
                ? new List<string>(File.ReadAllLines(envPath, Encoding.UTF8))
                : new List<string>();
            bool replaced = false;

            for (int index = 0; index < lines.Count; index += 1)
            {
                string line = lines[index].TrimStart();
                if (line.StartsWith("#")) continue;

                int eqIndex = line.IndexOf('=');
                if (eqIndex <= 0) continue;

                string currentKey = line.Substring(0, eqIndex).Trim();
                if (!string.Equals(currentKey, key, StringComparison.OrdinalIgnoreCase)) continue;

                lines[index] = key + "=" + value;
                replaced = true;
                break;
            }

            if (!replaced)
            {
                lines.Add(key + "=" + value);
            }

            File.WriteAllLines(envPath, lines.ToArray(), Encoding.UTF8);
        }

        private static int GetConfiguredPort(string envPath)
        {
            Dictionary<string, string> env = ReadEnv(envPath);
            int port;
            if (env.ContainsKey("PORT") && int.TryParse(env["PORT"], out port) && port > 0)
            {
                return port;
            }

            return DefaultPort;
        }

        private static string ResolveNodePath(string appDir)
        {
            string bundledNode = Path.Combine(appDir, "node", "node.exe");
            return File.Exists(bundledNode) ? bundledNode : "node";
        }

        private static Process StartNodeServer(string nodePath, string serverPath, string appDir)
        {
            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.FileName = nodePath;
            startInfo.Arguments = "\"" + serverPath + "\"";
            startInfo.WorkingDirectory = appDir;
            startInfo.UseShellExecute = false;
            startInfo.RedirectStandardOutput = true;
            startInfo.RedirectStandardError = true;
            startInfo.EnvironmentVariables["NODE_ENV"] = "production";

            Process process = new Process();
            process.StartInfo = startInfo;
            process.EnableRaisingEvents = true;
            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs args)
            {
                if (!string.IsNullOrWhiteSpace(args.Data)) Console.WriteLine(args.Data);
            };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs args)
            {
                if (!string.IsNullOrWhiteSpace(args.Data)) Console.Error.WriteLine(args.Data);
            };

            if (!process.Start())
            {
                throw new InvalidOperationException("无法启动 Node 服务。");
            }

            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            return process;
        }

        private static bool WaitForServer(string baseUrl, TimeSpan timeout)
        {
            DateTime deadline = DateTime.UtcNow.Add(timeout);
            while (DateTime.UtcNow < deadline)
            {
                if (serverProcess != null && serverProcess.HasExited) return false;
                if (IsHealthy(baseUrl)) return true;
                Thread.Sleep(350);
            }

            return false;
        }

        private static bool IsHealthy(string baseUrl)
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(baseUrl + "/health");
                request.Timeout = 800;
                request.Method = "GET";
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    return response.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        private static void OpenBrowser(string url)
        {
            try
            {
                ProcessStartInfo startInfo = new ProcessStartInfo();
                startInfo.FileName = url;
                startInfo.UseShellExecute = true;
                Process.Start(startInfo);
            }
            catch (Exception error)
            {
                Console.WriteLine("无法自动打开浏览器，请手动访问：" + url);
                Console.WriteLine(error.Message);
            }
        }

        private static void OpenTextEditor(string filePath)
        {
            try
            {
                ProcessStartInfo startInfo = new ProcessStartInfo();
                startInfo.FileName = "notepad.exe";
                startInfo.Arguments = "\"" + filePath + "\"";
                startInfo.UseShellExecute = false;
                Process.Start(startInfo);
            }
            catch
            {
                Console.WriteLine("请手动编辑：" + filePath);
            }
        }

        private static void AttachShutdownHandlers()
        {
            Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs args)
            {
                args.Cancel = true;
                StopServer();
                Environment.Exit(0);
            };

            AppDomain.CurrentDomain.ProcessExit += delegate { StopServer(); };
        }

        private static void StopServer()
        {
            try
            {
                if (serverProcess != null && !serverProcess.HasExited)
                {
                    serverProcess.Kill();
                }
            }
            catch
            {
                // The process is already gone or Windows is closing the console.
            }
        }
    }
}
