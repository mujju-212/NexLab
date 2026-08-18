# nexlab/csharp:10
# Covers: C# (.NET 10 / C# 14)
#
# .NET's file-based `dotnet run Main.cs` forces a NuGet restore against
# api.nuget.org on every invocation, which the sandbox's `--network none`
# blocks. So instead we bake a fully-restored console project into the image
# at /opt/csapp (build time = the only time the network is available), and at
# runtime the wrapper copies it into the writable /work, swaps in the student's
# code as Program.cs, and builds offline with `--no-restore`.
FROM mcr.microsoft.com/dotnet/sdk:10.0

LABEL maintainer="NexLab" \
      nexlab.image="csharp" \
      nexlab.version="10"

ENV DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_NOLOGO=1

# Pre-create and restore a console project so no per-run network is needed.
# world-writable (0777) so the sandbox's uid 65534 can copy it into /work.
RUN mkdir -p /opt/csapp && cd /opt/csapp && \
    dotnet new console -o . --name app && \
    dotnet build -c Release && \
    chmod -R 0777 /opt/csapp && \
    dotnet --version

RUN dotnet --version
