Feature: Login to Sauce Demo
  As a Sauce Demo user
  I want to log in with my credentials
  So that I can access the product inventory

  Background:
    Given I am on the Sauce Demo login page

  @smoke @positive
  Scenario: Successful login with a standard user
    When I log in as "standard" user
    Then I should be redirected to the inventory page
    And the page header should be "inventoryPage.title"

  @negative
  Scenario Outline: Login fails with invalid or missing credentials
    When I log in as "<userType>" user
    Then I should see the error message "<errorKey>"
    And I should remain on the login page

    Examples:
      | userType      | errorKey                                |
      | invalid       | loginPage.errors.invalidCredentials     |
      | locked        | loginPage.errors.lockedOut              |
      | emptyUsername | loginPage.errors.usernameRequired       |
      | emptyPassword | loginPage.errors.passwordRequired       |

  @positive
  Scenario: User can log out after logging in
    When I log in as "standard" user
    And I log out
    Then I should remain on the login page
