using System.ComponentModel.DataAnnotations;

namespace ShoeFactoryApi.Models
{
    /// <summary>
    /// One recorded change: who did what, when, and the values involved.
    /// Rows are only ever added, never edited or deleted by the app.
    /// </summary>
    public class AuditLog
    {
        [Key]
        public long Id { get; set; }

        public DateTime At { get; set; } = DateTime.UtcNow;

        // Username from the login token; "system" for startup jobs
        [MaxLength(100)]
        public string User { get; set; } = "system";

        // create / update / delete / login / login_failed
        [Required]
        [MaxLength(30)]
        public string Action { get; set; } = string.Empty;

        // Table the change was made to, e.g. Sale, Payment, User
        [Required]
        [MaxLength(60)]
        public string Entity { get; set; } = string.Empty;

        [MaxLength(64)]
        public string? EntityId { get; set; }

        // JSON: new values (create), { field: { old, new } } (update) or old values (delete)
        public string? Changes { get; set; }
    }
}
