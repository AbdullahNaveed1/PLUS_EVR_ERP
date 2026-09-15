FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY ShoeFactoryApi/ShoeFactoryApi.csproj ShoeFactoryApi/
RUN dotnet restore ShoeFactoryApi/ShoeFactoryApi.csproj

COPY ShoeFactoryApi/ ShoeFactoryApi/
WORKDIR /src/ShoeFactoryApi
RUN dotnet publish ShoeFactoryApi.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# Install postgresql-client for pg_dump support
RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "ShoeFactoryApi.dll"]